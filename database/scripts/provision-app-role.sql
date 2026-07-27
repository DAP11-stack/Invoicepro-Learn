\set ON_ERROR_STOP on

\if :{?app_password}
\else
  \echo 'Missing app_password. Run psql with -v app_password=your-strong-password.'
  \quit 1
\endif

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
    NOREPLICATION
    PASSWORD :'app_password';
\else
  ALTER ROLE invoicepro_app
    LOGIN
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOINHERIT
    NOREPLICATION
    PASSWORD :'app_password';
\endif

GRANT CONNECT ON DATABASE invoicepro TO invoicepro_app;
\connect invoicepro
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO invoicepro_app;
