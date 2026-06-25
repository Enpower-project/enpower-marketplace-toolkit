#!/bin/bash
set -e
# Create DB users
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
EOSQL

# Create the application database owned by the application user
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    CREATE DATABASE $KEYCLOAK_DB_NAME OWNER $DB_USER;
EOSQL

# Ensure the application user can fully use the default schema
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" -d "$KEYCLOAK_DB_NAME" <<-EOSQL
    ALTER SCHEMA public OWNER TO $DB_USER;
    GRANT USAGE, CREATE ON SCHEMA public TO $DB_USER;
EOSQL
