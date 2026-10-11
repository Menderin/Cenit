#!/usr/bin/env bash
# Runs only when the local PostgreSQL volume is first initialized. Never seeds business data.
set -euo pipefail
app_password=$(cat /run/secrets/app-password)
migrator_password=$(cat /run/secrets/migrator-password)
# setup-local.py creates hexadecimal credentials; reject other input before SQL interpolation.
[[ $app_password =~ ^[0-9a-f]{64}$ && $migrator_password =~ ^[0-9a-f]{64}$ ]]
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 <<SQL
CREATE ROLE cenit_migrator LOGIN PASSWORD '$migrator_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE cenit_app LOGIN PASSWORD '$app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA cenit AUTHORIZATION cenit_migrator;
GRANT CONNECT ON DATABASE cenit_demo TO cenit_app, cenit_migrator;
GRANT USAGE ON SCHEMA cenit TO cenit_app;
ALTER DEFAULT PRIVILEGES FOR ROLE cenit_migrator IN SCHEMA cenit
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cenit_app;
ALTER DEFAULT PRIVILEGES FOR ROLE cenit_migrator IN SCHEMA cenit
  GRANT USAGE, SELECT ON SEQUENCES TO cenit_app;
SQL
