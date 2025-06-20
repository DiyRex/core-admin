#!/bin/bash

# DNS Domain Clean and Setup Script
# Usage: ./clean-domain.sh <domain_name> <ip_address>
# Example: ./clean-domain.sh nftr.coz 192.168.1.100

set -e  # Exit on any error

DOMAIN_NAME="$1"
IP_ADDRESS="$2"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to execute PostgreSQL commands
exec_psql() {
    local sql="$1"
    docker-compose exec postgres psql -U coredns -d coredns -c "$sql" 2>/dev/null || {
        print_error "Failed to execute SQL: $sql"
        exit 1
    }
}

# Validate input parameters
if [ -z "$DOMAIN_NAME" ] || [ -z "$IP_ADDRESS" ]; then
    print_error "Usage: $0 <domain_name> <ip_address>"
    print_error "Example: $0 nftr.coz 192.168.1.100"
    exit 1
fi

# Validate IP address format (basic check)
if ! echo "$IP_ADDRESS" | grep -E '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$' > /dev/null; then
    print_error "Invalid IP address format: $IP_ADDRESS"
    exit 1
fi

print_status "Starting clean setup for domain: $DOMAIN_NAME with IP: $IP_ADDRESS"

# Step 1: Delete all existing records for the domain
print_status "Step 1: Cleaning existing records for $DOMAIN_NAME..."
exec_psql "
DELETE FROM records 
WHERE domain_id IN (
    SELECT id FROM domains WHERE name = '$DOMAIN_NAME'
);"

# Step 2: Delete the domain if it exists
print_status "Step 2: Removing existing domain entry..."
exec_psql "DELETE FROM domains WHERE name = '$DOMAIN_NAME';"

# Step 3: Create the domain
print_status "Step 3: Creating domain $DOMAIN_NAME..."
exec_psql "INSERT INTO domains (name, type) VALUES ('$DOMAIN_NAME', 'NATIVE');"

# Step 4: Get the domain ID
print_status "Step 4: Getting domain ID..."
DOMAIN_ID=$(docker-compose exec postgres psql -U coredns -d coredns -t -c "
SELECT id FROM domains WHERE name = '$DOMAIN_NAME';" | tr -d ' ' | head -1)

if [ -z "$DOMAIN_ID" ]; then
    print_error "Failed to get domain ID for $DOMAIN_NAME"
    exit 1
fi

print_success "Domain created with ID: $DOMAIN_ID"

# Step 5: Add SOA record
print_status "Step 5: Adding SOA record..."
SERIAL=$(date +%Y%m%d%H)
exec_psql "
INSERT INTO records (domain_id, name, type, content, ttl, disabled, auth) 
VALUES ($DOMAIN_ID, '$DOMAIN_NAME', 'SOA', 'ns1.$DOMAIN_NAME. admin.$DOMAIN_NAME. $SERIAL 7200 3600 1209600 3600', 3600, false, true);"

# Step 6: Add NS records
print_status "Step 6: Adding NS records..."
exec_psql "
INSERT INTO records (domain_id, name, type, content, ttl, disabled, auth) 
VALUES ($DOMAIN_ID, '$DOMAIN_NAME', 'NS', 'ns1.$DOMAIN_NAME.', 3600, false, true);"

exec_psql "
INSERT INTO records (domain_id, name, type, content, ttl, disabled, auth) 
VALUES ($DOMAIN_ID, '$DOMAIN_NAME', 'NS', 'ns2.$DOMAIN_NAME.', 3600, false, true);"

# Step 7: Add A record
print_status "Step 7: Adding A record..."
exec_psql "
INSERT INTO records (domain_id, name, type, content, ttl, disabled, auth) 
VALUES ($DOMAIN_ID, '$DOMAIN_NAME', 'A', '$IP_ADDRESS', 300, false, true);"

# Step 8: Add nameserver A records (optional but recommended)
print_status "Step 8: Adding nameserver A records..."
exec_psql "
INSERT INTO records (domain_id, name, type, content, ttl, disabled, auth) 
VALUES ($DOMAIN_ID, 'ns1.$DOMAIN_NAME', 'A', '$IP_ADDRESS', 3600, false, true);"

exec_psql "
INSERT INTO records (domain_id, name, type, content, ttl, disabled, auth) 
VALUES ($DOMAIN_ID, 'ns2.$DOMAIN_NAME', 'A', '$IP_ADDRESS', 3600, false, true);"

# Step 9: Verify records
print_status "Step 9: Verifying records..."
echo ""
print_status "Records created for $DOMAIN_NAME:"
docker-compose exec postgres psql -U coredns -d coredns -c "
SELECT r.name, r.type, r.content, r.ttl 
FROM records r 
JOIN domains d ON r.domain_id = d.id 
WHERE d.name = '$DOMAIN_NAME' 
ORDER BY r.type, r.name;" | head -20

# Step 10: Check record count
RECORD_COUNT=$(docker-compose exec postgres psql -U coredns -d coredns -t -c "
SELECT COUNT(*) FROM records r 
JOIN domains d ON r.domain_id = d.id 
WHERE d.name = '$DOMAIN_NAME';" | tr -d ' ' | head -1)

print_success "Total records created: $RECORD_COUNT"

# Step 11: Wait for zone file generation
print_status "Step 11: Waiting for zone file generation (15 seconds)..."
sleep 15

# Step 12: Test DNS resolution
print_status "Step 12: Testing DNS resolution..."
echo ""
print_status "Testing: dig @127.0.0.1 -p 53 $DOMAIN_NAME A"
dig @127.0.0.1 -p 53 "$DOMAIN_NAME" A

echo ""
print_success "Domain setup completed!"
print_status "You can now test with: dig @127.0.0.1 -p 53 $DOMAIN_NAME A"
print_status "Expected result: $DOMAIN_NAME should resolve to $IP_ADDRESS"

# Step 13: Quick validation
echo ""
print_status "Quick validation:"
RESOLVED_IP=$(dig @127.0.0.1 -p 53 "$DOMAIN_NAME" A +short | head -1)
if [ "$RESOLVED_IP" = "$IP_ADDRESS" ]; then
    print_success "✅ DNS resolution working! $DOMAIN_NAME resolves to $IP_ADDRESS"
else
    print_warning "⚠️  DNS resolution issue. Expected: $IP_ADDRESS, Got: $RESOLVED_IP"
    print_warning "Check CoreDNS logs: docker-compose logs dns-reloader"
fi