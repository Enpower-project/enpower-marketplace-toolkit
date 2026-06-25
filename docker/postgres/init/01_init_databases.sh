#!/bin/bash
# This script runs automatically the FIRST time the container starts up
# (when the data volume is empty). It creates the two necessary databases.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE dataspace_ingestion;
    CREATE DATABASE ds_scheduler;
EOSQL