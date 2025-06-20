# # Check database has data
# docker-compose exec postgres psql -U coredns -d coredns -c "SELECT id, name FROM domains;"
# docker-compose exec postgres psql -U coredns -d coredns -c "SELECT name, type, content FROM records LIMIT 5;"

# # Check zone files generated
# docker-compose exec dns-reloader ls -la /etc/coredns/zones/

# # View a zone file
# docker-compose exec dns-reloader cat /etc/coredns/zones/db.example.local

# # Check reloader logs
# docker-compose logs dns-reloader

# # Test DNS resolution
# dig @127.0.0.1 -p 53 www.example.local A
# dig @127.0.0.1 -p 53 health.check A

# Add test record
docker-compose exec postgres psql -U coredns -d coredns -c "
INSERT INTO records (domain_id, name, type, content, ttl, disabled, auth) 
VALUES (1, 'helloworld.co', 'A', '172.16.0.234', 300, false, true);"

# Wait for zone regeneration
sleep 10

# Test new record
dig @127.0.0.1 -p 53 test.example.local A
dig @127.0.0.1 -p 53 helloworld.com A