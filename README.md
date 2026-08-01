# InvoicePro

InvoicePro is a local-first, full-stack invoice management MVP for small B2B
sales and accounting workflows. It is built as a learning and portfolio project:
small enough to finish, but complete enough to demonstrate frontend, backend,
database, testing, and business-rule design.

> Current maturity: **Milestone 1 — Data and API (complete)**

## Problem

Small teams often track clients, invoice items, totals, due dates, and payment
status across separate spreadsheets or documents. This creates duplicate work
and makes invoice history difficult to verify.

InvoicePro keeps one reliable local record for:

- Client details.
- Invoice line items.
- Server-calculated financial totals.
- Invoice status and due dates.
- Printable PDF invoices.

## Target user

A single sales or accounting operator managing invoices for a small B2B
business. Multi-user access is intentionally excluded from the MVP.

## MVP outcome

The project is complete when this workflow works from the browser:

1. Create a client.
2. Create a draft invoice with one or more line items.
3. Save the invoice in PostgreSQL.
4. Verify subtotal, tax, and total calculated by the server.
5. Move the invoice through valid status changes.
6. Generate a PDF.
7. Reload the application and find the same stored data.
8. Pass automated tests for the critical workflow.

## MVP scope

### Client management

- Create, view, update, and list clients.
- Store business name, contact name, email, phone, billing address, and tax ID.
- Reject invalid input.
- Prevent deletion when a client is referenced by an invoice.

### Invoice management

- Create, view, update, list, and delete draft invoices.
- Add one or more line items.
- Generate unique invoice numbers on the server.
- Filter invoices by status or client.
- Allow financial edits only while an invoice is `DRAFT`.

### Financial rules

- Store money as PostgreSQL `NUMERIC(15,2)`.
- Calculate money with `decimal.js`; never trust browser totals.
- Round monetary results to two decimal places.
- Use these formulas:

```text
line_total = quantity × unit_price
subtotal   = sum(line_total)
tax_total  = subtotal × (tax_rate / 100)
grand_total = subtotal + tax_total
```

- MVP supports one tax rate per invoice and no discounts.
- Quantity must be greater than zero.
- Unit price and tax rate cannot be negative.

### Status workflow

```text
DRAFT -> SENT -> PAID
                 ^
SENT  -> OVERDUE |
```

- `DRAFT`: editable and not yet issued.
- `SENT`: issued; financial fields become read-only.
- `OVERDUE`: unpaid after due date.
- `PAID`: final paid state.
- Valid transitions: `DRAFT → SENT`, `SENT → PAID`,
  `SENT → OVERDUE`, and `OVERDUE → PAID`.
- Status changes are validated by the server.

### PDF

- Generate a local PDF for `SENT`, `OVERDUE`, or `PAID` invoices.
- Include business identity, client, invoice number, dates, line items, and
  totals.

## Non-goals

These features are excluded to protect the Rp0 budget and keep scope finishable:

- Authentication, roles, multi-user, or multi-tenant support.
- Payment gateway or money movement.
- Real email delivery.
- Cloud hosting, paid database, domain, or paid API.
- External accounting integration.
- Multiple currencies in one invoice.
- Discounts, refunds, recurring invoices, and partial payments.
- Production compliance or tax certification.

## Planned stack

| Area | Choice | Reason |
|---|---|---|
| Frontend | React, Vite, TypeScript | Fast local UI, typed components |
| Backend | Node.js, Express, TypeScript | Small, explicit REST API |
| Validation | Zod | Shared, readable input rules |
| Database | PostgreSQL with `pg` | Real relational DB and visible SQL |
| Money | `decimal.js` | Avoid floating-point errors |
| PDF | PDFKit | Local PDF generation without browser automation |
| Unit/API tests | Vitest and Supertest | Fast business-rule and endpoint tests |
| End-to-end test | Playwright | Verify critical browser workflow |
| Workspace | Root npm scripts + TypeScript | One repository, few moving parts |

All required software and libraries are free for local learning use.

## Architecture

```text
React web app
    |
    | JSON over REST
    v
Express API
    |
    | validated queries and transactions
    v
PostgreSQL

Express API -> PDFKit -> local PDF response
```

The browser handles presentation and form interaction. The API owns validation,
status transitions, invoice-number generation, and financial calculations.
PostgreSQL is the source of truth.

Detailed design: [docs/architecture.md](docs/architecture.md)

Local database setup: [docs/local-development.md](docs/local-development.md)

## Planned data model

- `clients`: billing and contact identity.
- `invoices`: client reference, dates, tax rate, totals, and status.
- `invoice_items`: description, quantity, unit price, and line total.

Each invoice belongs to one client. Each invoice has one or more items.
Invoice creation and item creation use one database transaction.

## API

Base path: `/api/v1`

```text
GET    /health

GET    /clients
POST   /clients
GET    /clients/:id
PATCH  /clients/:id
DELETE /clients/:id

GET    /invoices
POST   /invoices
GET    /invoices/:id
PATCH  /invoices/:id
DELETE /invoices/:id
POST   /invoices/:id/send
POST   /invoices/:id/mark-overdue
POST   /invoices/:id/mark-paid
GET    /invoices/:id/pdf
```

Client CRUD plus invoice create, list, detail, draft update/delete, and status
workflow endpoints are implemented. The PDF endpoint remains planned. The
current request, response, validation, filtering, pagination, and error contract is documented in
[docs/api.md](docs/api.md).

## Repository structure

```text
.
├── apps/
│   ├── api/            # Express API
│   └── web/            # React application
├── database/           # SQL migrations and seed data
├── docs/               # Scope, architecture, and decisions
├── tests/              # Cross-application end-to-end tests
├── README.md
└── .gitignore
```

## Milestones

- [x] **Milestone 0 — Foundation:** define problem, scope, rules, architecture,
  completion criteria, and repository baseline.
- [x] **Milestone 1 — Data and API:** workspace, restricted database role,
  schema migrations, health API, Client CRUD, server-authoritative financial
  calculations, atomic invoice creation and draft updates, filtered invoice
  lists, invoice detail, draft deletion, and atomic status workflow exist.
- [ ] **Milestone 2 — Web workflow:** client and invoice screens connected to
  the API, including loading, empty, success, and error states.
- [~] **Milestone 3 — Business workflow:** status rules and overdue handling are
  implemented. PDF generation remains.
- [ ] **Milestone 4 — Portfolio release:** end-to-end test, screenshots, demo,
  final README evidence, security review, and GitHub publication.

## Local setup

Install workspace dependencies:

```powershell
npm.cmd install
```

Create separate runtime and migration environment files:

```powershell
Copy-Item .env.example .env
Copy-Item .env.migration.example .env.migration
```

Set the restricted application password in `.env` and the PostgreSQL admin
password only in `.env.migration`; never commit either file. Provision the
application role with the `postgres` password entered only in hidden prompts:

If upgrading an existing checkout, copy `DATABASE_ADMIN_URL` from `.env` to
`.env.migration`, then remove it from `.env`.

```powershell
& 'E:\Programs\PostgreSQL\18\bin\psql.exe' -U postgres -d invoicepro -f database\scripts\provision-app-role.sql
```

Then apply schema and start API:

```powershell
npm.cmd run db:migrate
npm.cmd run dev:api
```

Health check: `GET http://localhost:3000/api/v1/health`.

Run fast route tests and PostgreSQL integration tests separately:

```powershell
npm.cmd test
npm.cmd run test:integration
```

Current machine check:

- Node.js: available.
- Git: available.
- npm: available through `npm.cmd` because PowerShell script execution blocks
  `npm.ps1`.
- PostgreSQL 18.4: installed locally on the external SSD.
- PostgreSQL service: `postgresql-x64-18`; start it before migration or API use.
- Development database: `invoicepro`.
- PostgreSQL CLI: available at
  `E:\Programs\PostgreSQL\18\bin\psql.exe`; not yet added to `PATH`.

No real credential belongs in this repository. Runtime credentials use the
ignored `.env`; migration-only admin credentials use the ignored
`.env.migration`. Their committed `.example` files contain placeholders only.

## Validation status

Milestone 0 validation is complete. Milestone 1 currently provides the
workspace, schema migrations, database-backed health API, and Client CRUD API.

Validated at this stage:

- Active project contained no legacy implementation.
- MVP has a defined target user and end-to-end workflow.
- Paid services are not required.
- Financial and status rules have one server-side authority.
- Scope and non-goals are explicit.
- Portfolio evidence requirements are defined.
- PostgreSQL 18.4 installation and service configuration were verified.
- The `invoicepro` database previously accepted a verified pgAdmin connection.
- Verification query returned database `invoicepro`, user `postgres`, and one
  PostgreSQL 18.4 server row.
- Migrations `001_initial_schema.sql` and
  `002_restrict_app_role_privileges.sql` are applied, along with
  `003_invoice_number_sequence.sql`.
- Database privilege audit confirms `invoicepro_app` has CRUD access to business
  tables and no access to `schema_migrations` or future tables by default.
- Forty-nine unit/API tests and seventeen PostgreSQL integration tests pass.
- TypeScript typecheck, production build, and dependency audit pass.

## Portfolio evidence required before release

- Working application with persisted PostgreSQL data.
- Automated test output for calculation, API, and critical browser workflow.
- Root README with reproducible setup and usage steps.
- Architecture and data-model documentation.
- Screenshots or short demo of the complete workflow.
- No exposed secrets.
- Clear limitations and honest project maturity.

## Current limitations

- Client CRUD routes and repository pass PostgreSQL-backed integration tests.
- Invoice creation, draft update/delete, financial calculations, filtered
  lists, detail reads, and status workflow exist. PDF generation and frontend
  screens do not exist yet.
- API and migration commands require their separate local environment files.
- PostgreSQL CLI is installed but not globally available on `PATH`.
- API contracts and UI wireframes are not yet frozen.
- No deployment is planned for MVP; demo runs locally.

## License

License decision is deferred until public GitHub publication.
