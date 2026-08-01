# Architecture

## Design goals

- Keep business rules on the server.
- Keep SQL and data relationships visible for learning.
- Use few services and dependencies.
- Make critical behavior testable without a browser.
- Preserve a clear path from user action to stored data.

## Components

### Web application

React renders client and invoice workflows. It sends raw user input to the API
and displays API results. Browser calculations may provide previews, but only
server totals are authoritative.

### API

Express provides REST endpoints. Layers:

```text
Route
Controller
Service
Repository
PostgreSQL
```

- Route binds URL and middleware.
- Controller converts HTTP input/output.
- Service owns calculations, status rules, and transactions.
- Repository owns SQL.

Small features may share files when separate layers add no clarity.

### Database

PostgreSQL is source of truth. Planned tables:

```text
clients
  id UUID primary key
  business_name text
  contact_name text nullable
  email text
  phone text nullable
  billing_address text
  tax_id text nullable
  created_at timestamptz
  updated_at timestamptz

invoices
  id UUID primary key
  client_id UUID foreign key
  invoice_number text unique
  issue_date date
  due_date date
  status invoice_status
  currency char(3)
  tax_rate numeric(5,2)
  subtotal numeric(15,2)
  tax_total numeric(15,2)
  grand_total numeric(15,2)
  notes text nullable
  created_at timestamptz
  updated_at timestamptz

invoice_items
  id UUID primary key
  invoice_id UUID foreign key
  description text
  quantity numeric(12,3)
  unit_price numeric(15,2)
  line_total numeric(15,2)
  position integer
```

Exact constraints and indexes will be reviewed with real query patterns before
the first migration.

## Invoice write transaction

```text
Validate request
Verify client
Calculate all totals
Begin transaction
Generate unique invoice number
Insert invoice
Insert items
Commit
Return stored invoice
```

Any failure rolls back the full write.

Invoice numbers use a PostgreSQL sequence and the format
`INV-YYYYMM-SEQUENCE`. Sequence gaps after rolled-back transactions are
accepted because uniqueness and concurrency safety matter more than gapless
numbering for this MVP.

Each line total is rounded to two decimal places with `ROUND_HALF_UP` before it
is added to the subtotal. Tax is calculated from the rounded subtotal and is
also rounded half-up to two decimal places. PostgreSQL receives only the
server-calculated decimal strings.

Invoice lists use one bounded page query plus one filtered count query. Invoice
detail uses one joined invoice/client query plus one ordered item query. Query
count therefore stays constant as the number of returned invoices or items
grows; the read API does not perform N+1 lookups.

## Trust boundaries

- Browser input is untrusted.
- Route parameters, query parameters, and JSON bodies are validated.
- Totals, invoice number, and allowed status changes come from server logic.
- SQL uses parameterized queries.
- API never returns stack traces or database internals.
- Environment variables hold local database credentials.

## Error contract

Planned shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invoice input is invalid.",
    "details": []
  }
}
```

Expected categories:

- `VALIDATION_ERROR`
- `NOT_FOUND`
- `CONFLICT`
- `INVALID_STATUS_TRANSITION`
- `INVOICE_NOT_EDITABLE`
- `INTERNAL_ERROR`

## Testing boundaries

- Unit tests: money calculations and status-transition rules.
- Integration tests: routes, database constraints, transactions, and errors.
- End-to-end test: full client-to-PDF browser journey.

## Deferred decisions

- Exact UI component structure and visual design.
- Automatic overdue scheduler versus evaluation during reads.
- Public license.

Each deferred choice must be settled before dependent implementation begins.

## Local infrastructure decision

The development machine uses native PostgreSQL 18.4 instead of Docker.

Reasons:

- PostgreSQL already runs directly on Windows as a service.
- Program and data files live on the external SSD.
- Fewer runtime layers keep the first full-stack project easier to inspect.
- The project still uses SQL migrations so database setup remains reproducible.

Current local values:

```text
Service:  postgresql-x64-18
Host:     localhost
Port:     5432
Database: invoicepro
```

The application must not connect as the `postgres` superuser. Milestone 1 will
create a restricted application role.
