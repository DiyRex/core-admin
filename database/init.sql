-- Drop existing triggers and functions first
DROP TRIGGER IF EXISTS records_change_trigger ON records;
DROP TRIGGER IF EXISTS domains_change_trigger ON domains;
DROP FUNCTION IF EXISTS notify_dns_change() CASCADE;
DROP FUNCTION IF EXISTS notify_records_change() CASCADE;
DROP FUNCTION IF EXISTS notify_domains_change() CASCADE;

-- DNS Management Database Schema
-- PowerDNS compatible with extensions for management

CREATE TABLE IF NOT EXISTS domains (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    master VARCHAR(128) DEFAULT NULL,
    last_check INT DEFAULT NULL,
    type VARCHAR(6) NOT NULL DEFAULT 'NATIVE',
    notified_serial INT DEFAULT NULL,
    account VARCHAR(40) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS domains_name_index ON domains(name);

CREATE TABLE IF NOT EXISTS records (
    id SERIAL PRIMARY KEY,
    domain_id INT REFERENCES domains(id) ON DELETE CASCADE,
    name VARCHAR(255) DEFAULT NULL,
    type VARCHAR(10) DEFAULT NULL,
    content VARCHAR(65000) DEFAULT NULL,
    ttl INT DEFAULT 300,
    prio INT DEFAULT NULL,
    disabled BOOLEAN DEFAULT FALSE,
    ordername VARCHAR(255) DEFAULT NULL,
    auth BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) DEFAULT 'system',
    comment TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS records_name_type_index ON records(name, type);
CREATE INDEX IF NOT EXISTS records_domain_id_index ON records(domain_id);
CREATE INDEX IF NOT EXISTS records_disabled_index ON records(disabled);

-- Domain metadata
CREATE TABLE IF NOT EXISTS domainmetadata (
    id SERIAL PRIMARY KEY,
    domain_id INT REFERENCES domains(id) ON DELETE CASCADE,
    kind VARCHAR(32) DEFAULT NULL,
    content TEXT DEFAULT NULL
);

-- Admin users table for NextJS app
CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'admin',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP DEFAULT NULL
);

-- DNS operation logs
CREATE TABLE IF NOT EXISTS dns_logs (
    id SERIAL PRIMARY KEY,
    domain_id INT REFERENCES domains(id) ON DELETE SET NULL,
    record_id INT REFERENCES records(id) ON DELETE SET NULL,
    action VARCHAR(20) NOT NULL, -- INSERT, UPDATE, DELETE
    old_values JSONB,
    new_values JSONB,
    user_id INT REFERENCES admin_users(id) ON DELETE SET NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Function for auto-updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_domains_updated_at ON domains;
CREATE TRIGGER update_domains_updated_at BEFORE UPDATE ON domains 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
DROP TRIGGER IF EXISTS update_records_updated_at ON records;
CREATE TRIGGER update_records_updated_at BEFORE UPDATE ON records 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function for DNS change notifications (records table)
CREATE OR REPLACE FUNCTION notify_records_change() 
RETURNS TRIGGER AS $$
DECLARE
    notification_data JSON;
BEGIN
    notification_data = json_build_object(
        'table', TG_TABLE_NAME,
        'action', TG_OP,
        'id', COALESCE(NEW.id, OLD.id),
        'domain_id', COALESCE(NEW.domain_id, OLD.domain_id),
        'name', COALESCE(NEW.name, OLD.name),
        'type', COALESCE(NEW.type, OLD.type),
        'timestamp', CURRENT_TIMESTAMP
    );
    
    PERFORM pg_notify('dns_records_changed', notification_data::text);
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function for DNS change notifications (domains table)
CREATE OR REPLACE FUNCTION notify_domains_change() 
RETURNS TRIGGER AS $$
DECLARE
    notification_data JSON;
BEGIN
    notification_data = json_build_object(
        'table', TG_TABLE_NAME,
        'action', TG_OP,
        'id', COALESCE(NEW.id, OLD.id),
        'domain_id', COALESCE(NEW.id, OLD.id), -- Use id as domain_id for domains table
        'name', COALESCE(NEW.name, OLD.name),
        'type', COALESCE(NEW.type, OLD.type),
        'timestamp', CURRENT_TIMESTAMP
    );
    
    PERFORM pg_notify('dns_records_changed', notification_data::text);
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Clear existing data to avoid conflicts
DELETE FROM records;
DELETE FROM domains;

-- Insert sample domains FIRST (without triggers)
INSERT INTO domains (name, type) VALUES 
    ('example.local', 'NATIVE'),
    ('company.internal', 'NATIVE');

-- SOA records (with proper FQDN formatting)
INSERT INTO records (domain_id, name, type, content, ttl, auth) VALUES 
    (1, 'example.local', 'SOA', 'ns1.example.local. admin.example.local. 2024010101 7200 3600 1209600 3600', 3600, true),
    (2, 'company.internal', 'SOA', 'ns1.company.internal. admin.company.internal. 2024010101 7200 3600 1209600 3600', 3600, true);

-- NS records (with proper trailing dots for FQDNs)
INSERT INTO records (domain_id, name, type, content, ttl, auth) VALUES 
    (1, 'example.local', 'NS', 'ns1.example.local.', 3600, true),
    (1, 'example.local', 'NS', 'ns2.example.local.', 3600, true),
    (2, 'company.internal', 'NS', 'ns1.company.internal.', 3600, true),
    (2, 'company.internal', 'NS', 'ns2.company.internal.', 3600, true);

-- Sample A records
INSERT INTO records (domain_id, name, type, content, ttl, disabled, auth) VALUES 
    (1, 'www.example.local', 'A', '192.168.1.10', 300, false, true),
    (1, 'api.example.local', 'A', '192.168.1.20', 300, false, true),
    (1, 'db.example.local', 'A', '192.168.1.30', 300, false, true),
    (1, 'ns1.example.local', 'A', '192.168.1.5', 3600, false, true),
    (1, 'ns2.example.local', 'A', '192.168.1.6', 3600, false, true),
    (2, 'mail.company.internal', 'A', '192.168.2.10', 300, false, true),
    (2, 'ns1.company.internal', 'A', '192.168.2.5', 3600, false, true),
    (2, 'ns2.company.internal', 'A', '192.168.2.6', 3600, false, true);

-- Sample CNAME records (with proper trailing dots)
INSERT INTO records (domain_id, name, type, content, ttl, disabled, auth) VALUES 
    (1, 'ftp.example.local', 'CNAME', 'www.example.local.', 300, false, true),
    (1, 'mail.example.local', 'CNAME', 'www.example.local.', 300, false, true),
    (2, 'smtp.company.internal', 'CNAME', 'mail.company.internal.', 300, false, true);

-- Sample MX records (with proper trailing dots)
INSERT INTO records (domain_id, name, type, content, ttl, prio, disabled, auth) VALUES 
    (1, 'example.local', 'MX', 'mail.example.local.', 3600, 10, false, true),
    (2, 'company.internal', 'MX', 'mail.company.internal.', 3600, 10, false, true);

-- Sample TXT records
INSERT INTO records (domain_id, name, type, content, ttl, disabled, auth) VALUES 
    (1, 'example.local', 'TXT', 'v=spf1 include:_spf.google.com ~all', 3600, false, true),
    (1, '_dmarc.example.local', 'TXT', 'v=DMARC1; p=none; rua=mailto:admin@example.local', 3600, false, true),
    (2, 'company.internal', 'TXT', 'v=spf1 mx ~all', 3600, false, true);

-- Default admin user (password: admin123 - change in production!)
INSERT INTO admin_users (username, email, password_hash, role) VALUES 
    ('admin', 'admin@example.local', '$2b$10$rRKvMqWnlbQ8jq3qZxnZhOKpG4YpJqV7KHvN9rGq8Dw1xQvFnA1Dm', 'admin')
ON CONFLICT (username) DO NOTHING;

-- NOW create triggers (after data insertion)
CREATE TRIGGER records_change_trigger
    AFTER INSERT OR UPDATE OR DELETE ON records
    FOR EACH ROW EXECUTE FUNCTION notify_records_change();

CREATE TRIGGER domains_change_trigger
    AFTER INSERT OR UPDATE OR DELETE ON domains
    FOR EACH ROW EXECUTE FUNCTION notify_domains_change();

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO coredns;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO coredns;

-- Verify data
SELECT 'Domains created:' as info, count(*) as count FROM domains;
SELECT 'Records created:' as info, count(*) as count FROM records;
SELECT 'Sample records:' as info;
SELECT name, type, content FROM records WHERE domain_id = 1 ORDER BY type, name LIMIT 10;