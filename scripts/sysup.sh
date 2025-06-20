# Complete clean slate
docker-compose down --volumes all

# Build everything fresh
docker-compose build

# Start postgres first
docker-compose up -d postgres

# Wait for postgres to initialize properly
sleep 20

# Check postgres logs to ensure success
docker-compose logs postgres

# Start other services
docker-compose up -d coredns dns-reloader

# Wait for services to start
sleep 10

# Check all services are running
docker-compose ps