# MVP Scope and Acceptance Criteria

## Product statement

InvoicePro helps one local B2B operator create clients, issue accurate invoices,
track payment status, and generate PDFs from one stored data source.

## Primary user journey

```text
Create client
Create draft invoice
Add line items
Review server totals
Send invoice
Mark overdue or paid
Generate PDF
Reload and verify stored history
```

## Functional acceptance criteria

### Clients

- Valid client input creates one persisted client.
- Invalid email or missing business name returns a structured validation error.
- Client updates persist after browser reload.
- Referenced clients cannot be deleted.

### Invoices

- Invoice requires an existing client and at least one valid item.
- API generates a unique invoice number.
- API ignores or rejects client-supplied totals.
- Invoice, items, and totals save atomically.
- Only draft financial content can be edited or deleted.
- List endpoint supports bounded pagination and status/client filters.

### Calculations

Given:

```text
Item A: 2 × 100000.00 = 200000.00
Item B: 1 × 50000.00  =  50000.00
Tax: 11%
```

Expected:

```text
subtotal:   250000.00
tax_total:   27500.00
grand_total: 277500.00
```

Calculation tests must cover decimal values, rounding boundaries, zero tax,
invalid negative values, and multiple items.

### Status

- Server accepts only documented transitions.
- `SENT` invoices reject financial edits.
- `PAID` invoices cannot move to another status.
- `SENT` invoice past due date can become `OVERDUE`.
- `OVERDUE` invoice can become `PAID`.

### PDF

- Eligible invoice returns a readable PDF.
- PDF values match stored invoice values.
- Draft invoice PDF request returns a domain error.

## Non-functional acceptance criteria

- Untrusted input validated at API boundary.
- Errors use one consistent JSON structure.
- Database operations needing atomicity use transactions.
- Potentially large lists use pagination.
- No secrets committed.
- UI usable by keyboard and on mobile and desktop widths.
- Loading, empty, success, error, and duplicate-submit states handled.
- Fresh-machine setup documented and reproducible.

## Definition of done

MVP is done only when:

- Critical browser journey succeeds.
- Data remains after restart.
- Unit, API integration, and end-to-end tests pass.
- Production build succeeds.
- Database migration succeeds from an empty database.
- README contains exact setup, validation, screenshots, architecture, and known
  limitations.
- Repository secret scan and final diff review find no sensitive data.

## Constraints

- Required monetary cost: Rp0.
- Local-first execution.
- Single user.
- One currency per invoice.
- One tax rate per invoice.
- No external service required.
