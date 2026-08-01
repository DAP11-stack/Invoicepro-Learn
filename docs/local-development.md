# Local Development Environment

## Installed database

```text
PostgreSQL version: 18.4
Installation:       E:\Programs\PostgreSQL\18
Data directory:     E:\Programs\PostgreSQL\18\data
Windows service:    postgresql-x64-18
Host:               localhost
Port:               5432
Database:           invoicepro
Admin tool:         pgAdmin 4
```

This is a machine-specific development setup, not a production design.

## Previously verified state

The following checks succeeded:

- Windows service status is `Running`.
- TCP port `5432` is listening.
- `psql --version` reports PostgreSQL 18.4.
- pgAdmin connected to the local server.
- Database `invoicepro` was created.
- This query returned one row:

```sql
SELECT current_database(), current_user, version();
```

Observed database and user:

```text
current_database: invoicepro
current_user:     postgres
server_version:   PostgreSQL 18.4
```

Service state can change between sessions. Check it before development:

```powershell
Get-Service postgresql-x64-18
```

After starting PostgreSQL and applying migrations, validate both test layers:

```powershell
npm.cmd test
npm.cmd run test:integration
```

The integration suite creates uniquely named records and deletes only those
records during teardown. It does not truncate shared tables.

## Security boundary

- The installer password is not stored in this repository.
- Never place a real password in README files, source code, or Git history.
- The `postgres` account is for local administration only.
- The application connects through the restricted `invoicepro_app` login role.
- Application credentials live in an ignored `.env` file.
- Migration-only admin credentials live in an ignored `.env.migration` file.
- The API runtime loader reads the runtime database, port, environment, and
  public invoice-issuer settings; it never loads `DATABASE_ADMIN_URL`.
- The application role has data access only to the three business tables. It
  cannot modify `schema_migrations`, and new tables require an explicit grant
  in their migration.
- `.env.example` and `.env.migration.example` contain placeholders only.

## Command-line tool

PowerShell does not currently resolve `psql` globally. Use the full path:

```powershell
& 'E:\Programs\PostgreSQL\18\bin\psql.exe' --version
```

Adding PostgreSQL to the user `PATH` is optional. Project scripts should not
depend on one developer's global `PATH` when a portable alternative exists.
