package main

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/lib/pq"
	"github.com/sirupsen/logrus"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type Config struct {
	PostgresHost     string
	PostgresDB       string
	PostgresUser     string
	PostgresPassword string
	CoreDNSContainer string
	ZonesDirectory   string
	LogLevel         string
	PollInterval     time.Duration
}

type DNSChangeNotification struct {
	Table     string    `json:"table"`
	Action    string    `json:"action"`
	ID        int       `json:"id"`
	DomainID  int       `json:"domain_id"`
	Name      string    `json:"name"`
	Type      string    `json:"type"`
	Timestamp time.Time `json:"timestamp"`
}

// GORM Models matching existing schema
type Record struct {
	ID        uint      `gorm:"primaryKey;column:id" json:"id"`
	DomainID  int       `gorm:"column:domain_id;index" json:"domain_id"`
	Name      string    `gorm:"column:name;index" json:"name"`
	Type      string    `gorm:"column:type;index" json:"type"`
	Content   string    `gorm:"column:content" json:"content"`
	TTL       int       `gorm:"column:ttl" json:"ttl"`
	Prio      *int      `gorm:"column:prio" json:"prio,omitempty"`
	Disabled  bool      `gorm:"column:disabled;default:false" json:"disabled"`
	Ordername *string   `gorm:"column:ordername" json:"ordername,omitempty"`
	Auth      bool      `gorm:"column:auth;default:true" json:"auth"`
	CreatedAt time.Time `gorm:"column:created_at" json:"created_at"`
	UpdatedAt time.Time `gorm:"column:updated_at" json:"updated_at"`
	CreatedBy string    `gorm:"column:created_by" json:"created_by"`
	Comment   *string   `gorm:"column:comment" json:"comment,omitempty"`
	Domain    Domain    `gorm:"foreignKey:DomainID;references:ID" json:"domain,omitempty"`
}

type Domain struct {
	ID             uint      `gorm:"primaryKey;column:id" json:"id"`
	Name           string    `gorm:"column:name;uniqueIndex" json:"name"`
	Master         *string   `gorm:"column:master" json:"master,omitempty"`
	LastCheck      *int      `gorm:"column:last_check" json:"last_check,omitempty"`
	Type           string    `gorm:"column:type" json:"type"`
	NotifiedSerial *int      `gorm:"column:notified_serial" json:"notified_serial,omitempty"`
	Account        *string   `gorm:"column:account" json:"account,omitempty"`
	CreatedAt      time.Time `gorm:"column:created_at" json:"created_at"`
	UpdatedAt      time.Time `gorm:"column:updated_at" json:"updated_at"`
	Records        []Record  `gorm:"foreignKey:DomainID;references:ID" json:"records,omitempty"`
}

// Table names to match existing schema
func (Record) TableName() string {
	return "records"
}

func (Domain) TableName() string {
	return "domains"
}

type Reloader struct {
	config   *Config
	db       *gorm.DB
	rawDB    *sql.DB
	listener *pq.Listener
	logger   *logrus.Logger
	ctx      context.Context
	cancel   context.CancelFunc
}

func NewReloader() *Reloader {
	config := &Config{
		PostgresHost:     getEnv("POSTGRES_HOST", "postgres"),
		PostgresDB:       getEnv("POSTGRES_DB", "coredns"),
		PostgresUser:     getEnv("POSTGRES_USER", "coredns"),
		PostgresPassword: getEnv("POSTGRES_PASSWORD", ""),
		CoreDNSContainer: getEnv("COREDNS_CONTAINER", "coredns-server"),
		ZonesDirectory:   getEnv("ZONES_DIRECTORY", "/etc/coredns/zones"),
		LogLevel:         getEnv("LOG_LEVEL", "info"),
		PollInterval:     parseDuration(getEnv("POLL_INTERVAL", "5s")),
	}

	logrusLogger := logrus.New()
	level, err := logrus.ParseLevel(config.LogLevel)
	if err != nil {
		level = logrus.InfoLevel
	}
	logrusLogger.SetLevel(level)

	ctx, cancel := context.WithCancel(context.Background())

	return &Reloader{
		config: config,
		logger: logrusLogger,
		ctx:    ctx,
		cancel: cancel,
	}
}

func (r *Reloader) connectDB() error {
	dsn := fmt.Sprintf(
		"host=%s user=%s password=%s dbname=%s port=5432 sslmode=disable TimeZone=UTC",
		r.config.PostgresHost,
		r.config.PostgresUser,
		r.config.PostgresPassword,
		r.config.PostgresDB,
	)

	var gormLogLevel logger.LogLevel
	switch r.config.LogLevel {
	case "debug":
		gormLogLevel = logger.Info
	default:
		gormLogLevel = logger.Silent
	}

	gormLogger := logger.New(
		r.logger,
		logger.Config{
			SlowThreshold:             time.Second,
			LogLevel:                  gormLogLevel,
			IgnoreRecordNotFoundError: true,
			Colorful:                  false,
		},
	)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger:                                   gormLogger,
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return fmt.Errorf("failed to get underlying sql.DB: %w", err)
	}

	sqlDB.SetMaxOpenConns(5)
	sqlDB.SetMaxIdleConns(2)
	sqlDB.SetConnMaxLifetime(time.Hour)

	if err := sqlDB.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	r.db = db
	r.rawDB = sqlDB
	r.logger.Info("Connected to PostgreSQL database with GORM")
	return nil
}

func (r *Reloader) setupListener() error {
	connStr := fmt.Sprintf(
		"host=%s dbname=%s user=%s password=%s sslmode=disable",
		r.config.PostgresHost,
		r.config.PostgresDB,
		r.config.PostgresUser,
		r.config.PostgresPassword,
	)

	listener := pq.NewListener(connStr, 10*time.Second, time.Minute, func(ev pq.ListenerEventType, err error) {
		if err != nil {
			r.logger.WithError(err).Error("PostgreSQL listener error")
		}
	})

	if err := listener.Listen("dns_records_changed"); err != nil {
		return fmt.Errorf("failed to listen on channel: %w", err)
	}

	r.listener = listener
	r.logger.Info("PostgreSQL listener setup complete")
	return nil
}

func (r *Reloader) generateZoneFile(domain Domain, records []Record) error {
	zonePath := filepath.Join(r.config.ZonesDirectory, fmt.Sprintf("db.%s", domain.Name))
	
	r.logger.WithFields(logrus.Fields{
		"domain": domain.Name,
		"path":   zonePath,
		"records": len(records),
	}).Debug("Generating zone file")

	var zoneContent strings.Builder
	
	// Zone header
	zoneContent.WriteString(fmt.Sprintf("$ORIGIN %s.\n", domain.Name))
	zoneContent.WriteString("$TTL 300\n\n")
	
	// Group records by type for better organization
	recordsByType := make(map[string][]Record)
	for _, record := range records {
		if !record.Disabled && record.Auth {
			recordsByType[strings.ToUpper(record.Type)] = append(recordsByType[strings.ToUpper(record.Type)], record)
		}
	}
	
	// Helper function to clean record names
	cleanRecordName := func(name string, domainName string) string {
		if name == domainName {
			return "@"
		}
		if strings.HasSuffix(name, "."+domainName) {
			return strings.TrimSuffix(name, "."+domainName)
		}
		if strings.HasSuffix(name, ".") {
			return name
		}
		return name
	}
	
	// Write SOA record first (required)
	if soaRecords, exists := recordsByType["SOA"]; exists {
		for _, record := range soaRecords {
			name := cleanRecordName(record.Name, domain.Name)
			zoneContent.WriteString(fmt.Sprintf("%-20s %d IN SOA %s\n", 
				name, record.TTL, record.Content))
		}
		zoneContent.WriteString("\n")
	} else {
		// Generate default SOA if missing
		serial := time.Now().Format("2006010215")
		defaultSOA := fmt.Sprintf("ns1.%s. admin.%s. %s 7200 3600 1209600 3600", 
			domain.Name, domain.Name, serial)
		zoneContent.WriteString(fmt.Sprintf("%-20s %d IN SOA %s\n", "@", 3600, defaultSOA))
		zoneContent.WriteString("\n")
	}
	
	// Write NS records
	if nsRecords, exists := recordsByType["NS"]; exists {
		for _, record := range nsRecords {
			name := cleanRecordName(record.Name, domain.Name)
			zoneContent.WriteString(fmt.Sprintf("%-20s %d IN NS  %s\n", 
				name, record.TTL, record.Content))
		}
		zoneContent.WriteString("\n")
	}
	
	// Write A records
	if aRecords, exists := recordsByType["A"]; exists {
		for _, record := range aRecords {
			name := cleanRecordName(record.Name, domain.Name)
			zoneContent.WriteString(fmt.Sprintf("%-20s %d IN A   %s\n", 
				name, record.TTL, record.Content))
		}
		zoneContent.WriteString("\n")
	}
	
	// Write CNAME records
	if cnameRecords, exists := recordsByType["CNAME"]; exists {
		for _, record := range cnameRecords {
			name := cleanRecordName(record.Name, domain.Name)
			zoneContent.WriteString(fmt.Sprintf("%-20s %d IN CNAME %s\n", 
				name, record.TTL, record.Content))
		}
		zoneContent.WriteString("\n")
	}
	
	// Write MX records
	if mxRecords, exists := recordsByType["MX"]; exists {
		for _, record := range mxRecords {
			name := cleanRecordName(record.Name, domain.Name)
			priority := 10
			if record.Prio != nil {
				priority = *record.Prio
			}
			zoneContent.WriteString(fmt.Sprintf("%-20s %d IN MX  %d %s\n", 
				name, record.TTL, priority, record.Content))
		}
		zoneContent.WriteString("\n")
	}
	
	// Write TXT records
	if txtRecords, exists := recordsByType["TXT"]; exists {
		for _, record := range txtRecords {
			name := cleanRecordName(record.Name, domain.Name)
			content := record.Content
			if !strings.HasPrefix(content, "\"") {
				content = fmt.Sprintf("\"%s\"", content)
			}
			zoneContent.WriteString(fmt.Sprintf("%-20s %d IN TXT %s\n", 
				name, record.TTL, content))
		}
		zoneContent.WriteString("\n")
	}
	
	// Create zones directory if it doesn't exist
	if err := os.MkdirAll(r.config.ZonesDirectory, 0755); err != nil {
		return fmt.Errorf("failed to create zones directory: %w", err)
	}
	
	// Write zone file atomically
	tempPath := zonePath + ".tmp"
	if err := os.WriteFile(tempPath, []byte(zoneContent.String()), 0644); err != nil {
		return fmt.Errorf("failed to write temporary zone file: %w", err)
	}
	
	if err := os.Rename(tempPath, zonePath); err != nil {
		return fmt.Errorf("failed to move zone file: %w", err)
	}
	
	r.logger.WithFields(logrus.Fields{
		"domain": domain.Name,
		"path":   zonePath,
		"records": len(records),
		"size": len(zoneContent.String()),
	}).Info("Generated zone file successfully")
	
	return nil
}

func (r *Reloader) regenerateAllZones() error {
	r.logger.Info("Regenerating all zone files")
	
	var domains []Domain
	if err := r.db.WithContext(r.ctx).Find(&domains).Error; err != nil {
		return fmt.Errorf("failed to fetch domains: %w", err)
	}
	
	for _, domain := range domains {
		var records []Record
		if err := r.db.WithContext(r.ctx).Where("domain_id = ?", domain.ID).Find(&records).Error; err != nil {
			r.logger.WithError(err).WithField("domain", domain.Name).Error("Failed to fetch records for domain")
			continue
		}
		
		if err := r.generateZoneFile(domain, records); err != nil {
			r.logger.WithError(err).WithField("domain", domain.Name).Error("Failed to generate zone file")
			continue
		}
	}
	
	r.logger.WithField("domains", len(domains)).Info("Zone regeneration completed")
	return nil
}

func (r *Reloader) triggerCoreReload(change *DNSChangeNotification) error {
	r.logger.WithFields(logrus.Fields{
		"action":    change.Action,
		"table":     change.Table,
		"domain_id": change.DomainID,
		"name":      change.Name,
		"type":      change.Type,
	}).Info("Triggering CoreDNS reload")

	if err := r.regenerateAllZones(); err != nil {
		r.logger.WithError(err).Error("Failed to regenerate zone files")
		return err
	}

	cmd := exec.CommandContext(r.ctx, "docker", "exec", r.config.CoreDNSContainer, "sh", "-c", "kill -USR1 1")
	output, err := cmd.CombinedOutput()
	if err != nil {
		r.logger.WithError(err).WithField("output", string(output)).Warn("Failed to send SIGUSR1, relying on auto-reload")
	} else {
		r.logger.Info("CoreDNS reload signal sent successfully")
	}

	return nil
}

func (r *Reloader) listenForNotifications() error {
	r.logger.Info("Listening for DNS record change notifications...")

	// ADD THIS: Generate initial zones on startup
	if err := r.regenerateAllZones(); err != nil {
		r.logger.WithError(err).Error("Failed initial zone generation")
	}

	for {
		select {
		case <-r.ctx.Done():
			return nil
		case notification := <-r.listener.Notify:
			if notification != nil {
				r.logger.WithField("payload", notification.Extra).Info("Received notification")
				
				change := &DNSChangeNotification{
					Table:     "records",
					Action:    "NOTIFICATION",
					Timestamp: time.Now(),
				}

				if err := r.triggerCoreReload(change); err != nil {
					r.logger.WithError(err).Error("Failed to handle notification")
				}
			}
		case <-time.After(30 * time.Second):
			if err := r.listener.Ping(); err != nil {
				r.logger.WithError(err).Error("Lost connection to PostgreSQL")
				return err
			}
		}
	}
}

func (r *Reloader) pollForChanges() error {
	r.logger.Info("Starting polling mode for DNS changes")
	
	lastCheck := time.Now().Add(-1 * time.Minute)
	ticker := time.NewTicker(r.config.PollInterval)
	defer ticker.Stop()

	// Initial zone generation
	if err := r.regenerateAllZones(); err != nil {
		r.logger.WithError(err).Error("Failed initial zone generation")
	}

	for {
		select {
		case <-r.ctx.Done():
			return nil
		case <-ticker.C:
			var count int64
			result := r.db.WithContext(r.ctx).Model(&Record{}).Where(
				"updated_at > ? OR created_at > ?", lastCheck, lastCheck,
			).Count(&count)
			
			if result.Error != nil {
				r.logger.WithError(result.Error).Error("Failed to check for changes")
				continue
			}

			var domainCount int64
			domainResult := r.db.WithContext(r.ctx).Model(&Domain{}).Where(
				"updated_at > ? OR created_at > ?", lastCheck, lastCheck,
			).Count(&domainCount)
			
			if domainResult.Error != nil {
				r.logger.WithError(domainResult.Error).Error("Failed to check for domain changes")
			}

			totalChanges := count + domainCount

			if totalChanges > 0 {
				r.logger.WithFields(logrus.Fields{
					"record_changes": count,
					"domain_changes": domainCount,
					"total_changes": totalChanges,
				}).Info("Detected DNS changes via polling")
				
				change := &DNSChangeNotification{
					Table:     "records",
					Action:    "POLL_DETECTED",
					Timestamp: time.Now(),
				}
				
				if err := r.triggerCoreReload(change); err != nil {
					r.logger.WithError(err).Error("Failed to trigger CoreDNS reload")
				}
			}
			
			lastCheck = time.Now()
		}
	}
}

func (r *Reloader) getRecordStats() error {
	var totalRecords int64
	var activeDomains int64
	
	if err := r.db.Model(&Record{}).Count(&totalRecords).Error; err != nil {
		return fmt.Errorf("failed to count records: %w", err)
	}
	
	if err := r.db.Model(&Domain{}).Count(&activeDomains).Error; err != nil {
		return fmt.Errorf("failed to count domains: %w", err)
	}
	
	r.logger.WithFields(logrus.Fields{
		"total_records": totalRecords,
		"active_domains": activeDomains,
		"zones_directory": r.config.ZonesDirectory,
	}).Info("DNS database statistics")
	
	return nil
}

func (r *Reloader) cleanup() {
	if r.listener != nil {
		r.listener.Close()
	}
	if r.rawDB != nil {
		r.rawDB.Close()
	}
}

func (r *Reloader) Run() error {
	defer r.cleanup()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigChan
		r.logger.Info("Received shutdown signal")
		r.cancel()
	}()

	var dbConnected bool
	for i := 0; i < 10; i++ {
		if err := r.connectDB(); err != nil {
			r.logger.WithError(err).Warnf("Failed to connect to database (attempt %d/10)", i+1)
			time.Sleep(5 * time.Second)
			continue
		}
		dbConnected = true
		break
	}

	if !dbConnected {
		return fmt.Errorf("failed to connect to database after 10 attempts")
	}

	// Skip auto-migration since we have existing schema
	r.logger.Info("Skipping auto-migration, using existing database schema")

	if err := r.getRecordStats(); err != nil {
		r.logger.WithError(err).Warn("Failed to get database statistics")
	}

	if err := r.setupListener(); err != nil {
		r.logger.WithError(err).Warn("Failed to setup PostgreSQL listener, falling back to polling")
		return r.pollForChanges()
	}

	return r.listenForNotifications()
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func parseDuration(s string) time.Duration {
	d, err := time.ParseDuration(s)
	if err != nil {
		return 5 * time.Second
	}
	return d
}

func main() {
	reloader := NewReloader()
	
	reloader.logger.Info("DNS Zone File Generator starting...")
	
	if err := reloader.Run(); err != nil {
		reloader.logger.WithError(err).Fatal("Zone file generator failed")
	}
	
	reloader.logger.Info("DNS Zone File Generator stopped")
}