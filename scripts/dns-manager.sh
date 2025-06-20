#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🌐 DNS Management System - Domain Tester${NC}"
echo "=============================================="

# Get input from user
read -p "Enter domain name (e.g., test.local): " DOMAIN
read -p "Enter IP address (e.g., 192.168.1.100): " IP_ADDRESS

if [[ -z "$DOMAIN" || -z "$IP_ADDRESS" ]]; then
    echo -e "${RED}❌ Error: Domain and IP address are required${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}📝 Adding domain: $DOMAIN with IP: $IP_ADDRESS${NC}"
echo ""

# Step 1: Add domain to database
echo -e "${BLUE}Step 1: Creating domain in database...${NC}"
docker-compose exec -T postgres psql -U coredns -d coredns -c "
INSERT INTO domains (name, type) 
VALUES ('$DOMAIN', 'NATIVE') 
ON CONFLICT (name) DO NOTHING;
" > /dev/null 2>&1

# Get domain ID
DOMAIN_ID=$(docker-compose exec -T postgres psql -U coredns -d coredns -t -c "
SELECT id FROM domains WHERE name = '$DOMAIN';
" | tr -d ' ' | grep -v '^$')

if [[ -z "$DOMAIN_ID" ]]; then
    echo -e "${RED}❌ Failed to create domain${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Domain created with ID: $DOMAIN_ID${NC}"

# Step 2: Add DNS records
echo -e "${BLUE}Step 2: Adding DNS records...${NC}"

# Generate serial number (current date + hour)
SERIAL=$(date +"%Y%m%d%H")

# Add SOA record
docker-compose exec -T postgres psql -U coredns -d coredns -c "
INSERT INTO records (domain_id, name, type, content, ttl, auth) 
VALUES ($DOMAIN_ID, '$DOMAIN', 'SOA', 'ns1.$DOMAIN. admin.$DOMAIN. $SERIAL 7200 3600 1209600 3600', 3600, true)
ON CONFLICT DO NOTHING;
" > /dev/null 2>&1

# Add NS records
docker-compose exec -T postgres psql -U coredns -d coredns -c "
INSERT INTO records (domain_id, name, type, content, ttl, auth) VALUES 
($DOMAIN_ID, '$DOMAIN', 'NS', 'ns1.$DOMAIN.', 3600, true),
($DOMAIN_ID, '$DOMAIN', 'NS', 'ns2.$DOMAIN.', 3600, true)
ON CONFLICT DO NOTHING;
" > /dev/null 2>&1

# Add A record for www
docker-compose exec -T postgres psql -U coredns -d coredns -c "
INSERT INTO records (domain_id, name, type, content, ttl, disabled, auth) 
VALUES ($DOMAIN_ID, 'www.$DOMAIN', 'A', '$IP_ADDRESS', 300, false, true)
ON CONFLICT DO NOTHING;
" > /dev/null 2>&1

# Add A record for root domain
docker-compose exec -T postgres psql -U coredns -d coredns -c "
INSERT INTO records (domain_id, name, type, content, ttl, disabled, auth) 
VALUES ($DOMAIN_ID, '$DOMAIN', 'A', '$IP_ADDRESS', 300, false, true)
ON CONFLICT DO NOTHING;
" > /dev/null 2>&1

# Add A records for nameservers
docker-compose exec -T postgres psql -U coredns -d coredns -c "
INSERT INTO records (domain_id, name, type, content, ttl, disabled, auth) VALUES
($DOMAIN_ID, 'ns1.$DOMAIN', 'A', '$IP_ADDRESS', 3600, false, true),
($DOMAIN_ID, 'ns2.$DOMAIN', 'A', '$IP_ADDRESS', 3600, false, true)
ON CONFLICT DO NOTHING;
" > /dev/null 2>&1

echo -e "${GREEN}✅ DNS records added (SOA, NS, A)${NC}"

# Step 3: Wait for zone regeneration
echo -e "${BLUE}Step 3: Waiting for zone file generation...${NC}"
sleep 8

# Check if zone file was generated
if docker-compose exec -T dns-reloader test -f "/etc/coredns/zones/db.$DOMAIN"; then
    echo -e "${GREEN}✅ Zone file generated successfully${NC}"
else
    echo -e "${YELLOW}⚠️  Zone file not found, triggering manual regeneration...${NC}"
    # Trigger manual regeneration
    docker-compose exec -T postgres psql -U coredns -d coredns -c "
    UPDATE records SET updated_at = CURRENT_TIMESTAMP WHERE domain_id = $DOMAIN_ID LIMIT 1;
    " > /dev/null 2>&1
    sleep 5
fi

# Step 4: Test DNS resolution
echo -e "${BLUE}Step 4: Testing DNS resolution...${NC}"
echo ""

# Test root domain
echo -e "${YELLOW}Testing: $DOMAIN${NC}"
if dig @127.0.0.1 -p 53 +short "$DOMAIN" A | grep -q "$IP_ADDRESS"; then
    echo -e "${GREEN}✅ $DOMAIN → $IP_ADDRESS${NC}"
else
    echo -e "${RED}❌ $DOMAIN resolution failed${NC}"
    echo "Output:"
    dig @127.0.0.1 -p 53 "$DOMAIN" A
fi

echo ""

# Test www subdomain
echo -e "${YELLOW}Testing: www.$DOMAIN${NC}"
if dig @127.0.0.1 -p 53 +short "www.$DOMAIN" A | grep -q "$IP_ADDRESS"; then
    echo -e "${GREEN}✅ www.$DOMAIN → $IP_ADDRESS${NC}"
else
    echo -e "${RED}❌ www.$DOMAIN resolution failed${NC}"
    echo "Output:"
    dig @127.0.0.1 -p 53 "www.$DOMAIN" A
fi

echo ""

# Test SOA record
echo -e "${YELLOW}Testing: $DOMAIN SOA record${NC}"
if dig @127.0.0.1 -p 53 +short "$DOMAIN" SOA | grep -q "ns1.$DOMAIN"; then
    echo -e "${GREEN}✅ SOA record working${NC}"
else
    echo -e "${RED}❌ SOA record failed${NC}"
fi

# Test NS records
echo -e "${YELLOW}Testing: $DOMAIN NS records${NC}"
if dig @127.0.0.1 -p 53 +short "$DOMAIN" NS | grep -q "ns1.$DOMAIN"; then
    echo -e "${GREEN}✅ NS records working${NC}"
else
    echo -e "${RED}❌ NS records failed${NC}"
fi

echo ""
echo -e "${BLUE}📊 Zone File Content:${NC}"
echo "====================="
docker-compose exec dns-reloader cat "/etc/coredns/zones/db.$DOMAIN" 2>/dev/null || echo "Zone file not accessible"

echo ""
echo -e "${BLUE}📋 Database Records:${NC}"
echo "===================="
docker-compose exec -T postgres psql -U coredns -d coredns -c "
SELECT name, type, content, ttl FROM records 
WHERE domain_id = $DOMAIN_ID 
ORDER BY type, name;
"

echo ""
echo -e "${GREEN}🎉 Test completed for domain: $DOMAIN${NC}"
echo ""
echo -e "${YELLOW}💡 You can now test additional queries:${NC}"
echo "dig @127.0.0.1 -p 53 $DOMAIN A"
echo "dig @127.0.0.1 -p 53 www.$DOMAIN A"
echo "dig @127.0.0.1 -p 53 $DOMAIN SOA"
echo "dig @127.0.0.1 -p 53 $DOMAIN NS"