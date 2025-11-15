#!/bin/bash

# Songwriting Camps Migration Script
# ==================================
# This script applies the database changes for the songwriting camps feature.
#
# Prerequisites:
# - PostgreSQL client (psql) must be installed
# - Database connection environment variables must be set:
#   - DB_HOST
#   - DB_PORT (optional, defaults to 5432)
#   - DB_NAME
#   - DB_USER
#   - DB_PASSWORD
#
# Usage:
#   chmod +x scripts/run-songwriting-camps-migration.sh
#   ./scripts/run-songwriting-camps-migration.sh

set -e  # Exit on any error

# Default values
DB_PORT=${DB_PORT:-5432}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting Songwriting Camps Database Migration${NC}"
echo "=================================================="

# Check if required environment variables are set
if [ -z "$DB_HOST" ] || [ -z "$DB_NAME" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ]; then
    echo -e "${RED}❌ Error: Required environment variables not set${NC}"
    echo "Please set the following environment variables:"
    echo "  - DB_HOST"
    echo "  - DB_NAME"
    echo "  - DB_USER"
    echo "  - DB_PASSWORD"
    echo "  - DB_PORT (optional, defaults to 5432)"
    exit 1
fi

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ Error: psql command not found${NC}"
    echo "Please install PostgreSQL client tools"
    exit 1
fi

# Migration file path
MIGRATION_FILE="api/migrations/history/songwriting-camps.txt"

# Check if migration file exists
if [ ! -f "$MIGRATION_FILE" ]; then
    echo -e "${RED}❌ Error: Migration file not found: $MIGRATION_FILE${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Migration Details:${NC}"
echo "  - Database: $DB_NAME on $DB_HOST:$DB_PORT"
echo "  - User: $DB_USER"
echo "  - Migration File: $MIGRATION_FILE"
echo ""

# Export password for psql
export PGPASSWORD="$DB_PASSWORD"

echo -e "${YELLOW}⚡ Executing migration...${NC}"

# Run the migration
if psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -f "$MIGRATION_FILE" --quiet; then
    echo -e "${GREEN}✅ Migration completed successfully!${NC}"
    echo ""
    echo -e "${GREEN}📝 Summary of Changes:${NC}"
    echo "  ✓ Created camps table"
    echo "  ✓ Created rooms table"
    echo "  ✓ Created user_camps junction table"
    echo "  ✓ Created user_rooms junction table"
    echo "  ✓ Added camp_id, room_id, and key columns to tracks table"
    echo "  ✓ Created performance indexes"
    echo "  ✓ Added timestamp triggers"
    echo "  ✓ Added camp code generation function"
    echo ""
    echo -e "${YELLOW}🎯 Next Steps:${NC}"
    echo "  1. Update your application code to use the new tables"
    echo "  2. Test camp creation and user assignment functionality"
    echo "  3. Update track upload endpoints to handle camp/room context"
    echo "  4. Implement camp access controls for private tracks"
else
    echo -e "${RED}❌ Migration failed!${NC}"
    echo "Please check the error messages above and fix any issues before retrying."
    exit 1
fi
