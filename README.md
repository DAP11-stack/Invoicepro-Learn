# InvoicePro

InvoicePro is a local-first REST API for managing B2B clients and invoices. It
focuses on reliable financial calculations, explicit invoice lifecycle rules,
transactional PostgreSQL writes, and a reproducible test suite.

> **Project status:** Functional backend prototype. The data and API milestone
> is complete; the browser interface, PDF generation, and deployment are still
> in development.

## Why this project exists

Small businesses often manage client records, invoice line items, totals, due
dates, and payment status across disconnected spreadsheets or documents.
InvoicePro explores how those workflows can be represented by one consistent
data model with server-authoritative business rules.

The current MVP targets a single local sales or accounting operator. It does
not yet include authentication, multiple organizations, payment processing, or
other production SaaS concerns.

## Implemented features

### Client management

- Create, list, retrieve, and update clients.
- Store business, contact, billing, and tax information.
- Validate all API input with explicit schemas.
- Prevent deletion when a client is referenced by an invoice.

### Invoice management

- Create, list, retrieve, update, and delete draft invoices.
- Store one or more ordered line items per invoice.
- Generate concurrency-safe invoice numbers in PostgreSQL.
- Filter invoice lists by status or client with bounded pagination.
- Reject financial edits and deletion after an invoice leaves `DRAFT`.

### Financial rules

- Calculate line totals, subtotal, tax, and grand total on the server.
- Use `decimal.js` and PostgreSQL `NUMERIC` instead of binary floating point.
- Apply `ROUND_HALF_UP` to monetary results.
- Reject negative prices, invalid tax rates, and non-positive quantities.
- Treat totals as server-owned values; caller-provided financial fields are
  rejected at the validation boundary.

### Status workflow

```text
DRAFT ──> SENT ──> PAID
             │        ▲
             └─> OVERDUE
```

Valid transitions are:

- `DRAFT → SENT`
- `SENT → PAID`
- `SENT → OVERDUE` after the due date has passed
- `OVERDUE → PAID`

`PAID` is terminal. Status changes use database row locks, so concurrent
duplicate actions cannot both succeed.

## Engineering highlights

- Layered TypeScript design: route, service, repository, and PostgreSQL.
- Atomic invoice header and line-item writes with rollback on failure.
- `SELECT ... FOR UPDATE` protects draft mutations and status transitions from
  race conditions.
- PostgreSQL sequence-backed invoice numbers remain unique under concurrency.
- Constant-query invoice list/detail reads avoid N+1 database access.
- Runtime and migration credentials are separated into different environment
  files.
- The restricted application role cannot access migration history or receive
  privileges on future tables automatically.
- Consistent JSON error contracts without database details or stack traces.

## Technology stack

| Area | Technology |
|---|---|
| Runtime | Node.js 22+ |
| Language | TypeScript |
| API | Express 5 |
| Validation | Zod |
| Database | PostgreSQL with `pg` |
| Financial arithmetic | `decimal.js` |
| Testing | Vitest and Supertest |

## Architecture

```text
HTTP client
    │
    ▼
Express routes ── validation and HTTP error mapping
    │
    ▼
Application services ── calculations and lifecycle rules
    │
    ▼
PostgreSQL repositories ── parameterized queries and transactions
    │
    ▼
PostgreSQL ── relational constraints and persistent source of truth
```

The API owns invoice numbers, totals, allowed status changes, and resource
mutation rules. PostgreSQL enforces relational integrity and stores money as
fixed-precision numeric values.

See [Architecture](docs/architecture.md) for the detailed design and
[API Contract](docs/api.md) for request, response, and error behavior.

## API overview

Base path: `/api/v1`

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/health` | Check API and database health |
| `GET` | `/clients` | List clients |
| `POST` | `/clients` | Create a client |
| `GET` | `/clients/:id` | Retrieve a client |
| `PATCH` | `/clients/:id` | Update a client |
| `DELETE` | `/clients/:id` | Delete an unreferenced client |
| `GET` | `/invoices` | List and filter invoices |
| `POST` | `/invoices` | Create a draft invoice |
| `GET` | `/invoices/:id` | Retrieve invoice details |
| `PATCH` | `/invoices/:id` | Update a draft invoice |
| `DELETE` | `/invoices/:id` | Delete a draft invoice |
| `POST` | `/invoices/:id/send` | Move `DRAFT` to `SENT` |
| `POST` | `/invoices/:id/mark-overdue` | Move past-due `SENT` to `OVERDUE` |
| `POST` | `/invoices/:id/mark-paid` | Move `SENT` or `OVERDUE` to `PAID` |

## Getting started

### Prerequisites

- Node.js 22 or newer
- npm 10 or newer
- PostgreSQL with the `psql` command-line client

### 1. Install dependencies

```bash
git clone https://github.com/DAP11-stack/Invoicepro-Learn.git
cd Invoicepro-Learn
npm install
```

### 2. Create the local database and restricted application role

Create an empty `invoicepro` database using PostgreSQL administration tools:

```bash
psql -U postgres -c "CREATE DATABASE invoicepro;"
```

Provision the restricted runtime role. The script prompts for its password
without storing that password in the repository:

```bash
psql -U postgres -d invoicepro -f database/scripts/provision-app-role.sql
```

### 3. Configure local environment files

On macOS or Linux:

```bash
cp .env.example .env
cp .env.migration.example .env.migration
```

On PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item .env.migration.example .env.migration
```

Replace the placeholder passwords:

- `.env` contains the restricted `invoicepro_app` runtime connection.
- `.env.migration` contains the admin connection used only by migrations.

Both real environment files are ignored by Git. The API runtime never loads
`DATABASE_ADMIN_URL`.

### 4. Apply migrations and start the API

```bash
npm run db:migrate
npm run dev:api
```

The default API URL is `http://localhost:3000`. Verify it with:

```bash
curl http://localhost:3000/api/v1/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "invoicepro-api",
  "database": "connected"
}
```

Machine-specific PostgreSQL notes are kept in
[Local Development](docs/local-development.md).

## Validation

Run the fast unit and API tests:

```bash
npm test
```

Run PostgreSQL-backed integration tests after configuring and migrating the
local database:

```bash
npm run test:integration
```

Run static and production compilation checks:

```bash
npm run typecheck
npm run build
```

At this revision, the validated suite contains:

- 49 passing unit/API tests.
- 17 passing PostgreSQL integration tests.
- Coverage for financial rounding, validation, rollback, access restrictions,
  unique invoice numbering, draft-only mutations, status transitions, and
  concurrent duplicate actions.
- A clean high-severity dependency audit.

Integration tests create uniquely identified records and remove only those
records during teardown; they do not truncate shared tables.

## Repository structure

```text
.
├── apps/api/                 # Express API, domain logic, and tests
├── database/migrations/      # Ordered PostgreSQL migrations
├── database/scripts/         # Restricted-role provisioning
├── docs/                     # Scope, architecture, API, and local setup
├── .env.example              # Runtime configuration template
├── .env.migration.example    # Migration configuration template
└── package.json              # Workspace commands and dependencies
```

## Roadmap

- [x] PostgreSQL schema, migrations, and restricted runtime role
- [x] Client CRUD API
- [x] Invoice calculations and atomic draft workflow
- [x] Filtered invoice reads and complete invoice details
- [x] Draft update/delete rules
- [x] Invoice status lifecycle and concurrency protection
- [ ] React browser workflow with responsive loading, empty, success, and error states
- [ ] PDF generation for issued invoices
- [ ] End-to-end browser tests
- [ ] Screenshots, demo, and deployment documentation
- [ ] Production-oriented authentication, authorization, and multi-tenant design

## Current limitations

- The project currently exposes an API only; the browser UI is not implemented.
- Overdue status is triggered through an explicit API action, not a scheduler.
- PDF generation and email delivery are not implemented.
- Authentication, authorization, and tenant isolation are outside the current
  local MVP.
- Discounts, partial payments, refunds, and recurring invoices are unsupported.
- This project is not a certified accounting or tax-compliance system.
- No hosted demo is available yet.

## Portfolio scope

This project demonstrates backend API design, relational data modeling,
fixed-precision financial calculations, transaction design, concurrency
control, input validation, security boundaries, automated testing, and
technical documentation. A browser demo and deployment evidence are still
required before the project can be classified as portfolio-ready.

## License

No open-source license has been selected yet.
