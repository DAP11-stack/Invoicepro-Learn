\set ON_ERROR_STOP on

SELECT NOT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname = 'invoicepro_app'
) AS role_missing \gset

\if :role_missing
  CREATE ROLE invoicepro_app
    LOGIN
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOINHERIT
    NOREPLICATION;
\else
  ALTER ROLE invoicepro_app
    LOGIN
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOINHERIT
    NOREPLICATION;
\endif

\password invoicepro_app

GRANT CONNECT ON DATABASE invoicepro TO invoicepro_app;
\connect invoicepro
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO invoicepro_app;
