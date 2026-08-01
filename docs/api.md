# API Contract

Base path: `/api/v1`

All request bodies use JSON. Successful resource responses use `{ "data": ... }`.
Errors use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invoice input is invalid.",
    "details": []
  }
}
```

## Create invoice

`POST /invoices`

Example request:

```json
{
  "clientId": "8ee050d9-c8f5-48c8-8508-fc4ebd4237d5",
  "issueDate": "2026-08-01",
  "dueDate": "2026-08-31",
  "currency": "IDR",
  "taxRate": "11",
  "notes": "August order",
  "items": [
    {
      "description": "Item A",
      "quantity": "2",
      "unitPrice": "100000.00"
    },
    {
      "description": "Item B",
      "quantity": "1",
      "unitPrice": "50000.00"
    }
  ]
}
```

Decimal fields accept JSON strings or numbers. Strings are recommended so the
browser does not introduce binary floating-point conversion before submission.

The request must not contain `invoiceNumber`, `status`, `subtotal`, `taxTotal`,
`grandTotal`, `lineTotal`, or `position`. The server owns those fields.

Validation limits:

- Existing UUID client.
- ISO calendar dates in `YYYY-MM-DD`; due date cannot precede issue date.
- Three-letter currency code; defaults to `IDR`.
- Tax rate from `0` to `100`, with at most two decimal places; defaults to `0`.
- Between 1 and 100 items.
- Quantity greater than zero, at most three decimal places.
- Unit price non-negative, at most two decimal places.
- Notes are optional or nullable, with a maximum of 2,000 characters.

Success: HTTP `201`. The response contains the generated invoice number,
`DRAFT` status, normalized decimal strings, calculated totals, persisted item
IDs, and timestamps.

Relevant errors:

- `400 VALIDATION_ERROR`: malformed or unsupported input, including totals
  supplied by the caller.
- `404 NOT_FOUND`: the selected client does not exist.
- `500 INTERNAL_ERROR`: unexpected failure; database internals are not exposed.

Invoice number format:

```text
INV-YYYYMM-SEQUENCE
```

The sequence is PostgreSQL-backed and globally increasing. Rollbacks may leave
gaps, which is expected; generated numbers remain unique under concurrent
requests.

## List invoices

`GET /invoices`

Optional query parameters:

- `limit`: integer from 1 to 100; defaults to 20.
- `offset`: non-negative safe integer; defaults to 0.
- `status`: `DRAFT`, `SENT`, `OVERDUE`, or `PAID`.
- `clientId`: client UUID.

Unknown query parameters are rejected. Results are ordered by newest creation
timestamp and UUID. Each list item includes invoice fields and a client summary,
but excludes line items. Pagination metadata remains accurate when an offset
returns an empty page:

```json
{
  "data": [],
  "pagination": {
    "limit": 20,
    "offset": 100,
    "total": 2
  }
}
```

## Get invoice detail

`GET /invoices/:id`

Success: HTTP `200`. The response includes invoice fields, complete client
billing/contact data, and line items ordered by `position`.

Relevant errors:

- `400 VALIDATION_ERROR`: the route parameter is not a UUID.
- `404 NOT_FOUND`: no invoice has the requested UUID.

## Update draft invoice

`PATCH /invoices/:id`

The request may include one or more of `clientId`, `issueDate`, `dueDate`,
`currency`, `taxRate`, `notes`, or `items`. An empty object is rejected. When
`items` is present it replaces the complete line-item collection and must
contain between 1 and 100 items. Server-owned fields such as `invoiceNumber`,
`status`, and all totals are rejected.

The server merges partial input with the persisted invoice, validates the full
date range, recalculates every financial value, and writes the header and items
atomically. The invoice number and status do not change.

Success: HTTP `200` with `{ "data": invoice }`.

Relevant errors:

- `400 VALIDATION_ERROR`: invalid route parameter, payload, merged date range,
  or calculated value.
- `404 NOT_FOUND`: the invoice or selected client does not exist.
- `409 INVOICE_NOT_EDITABLE`: the invoice is no longer `DRAFT`.

## Delete draft invoice

`DELETE /invoices/:id`

Success: HTTP `204` with no response body. Associated line items are deleted by
the database foreign-key cascade.

Relevant errors:

- `400 VALIDATION_ERROR`: the route parameter is not a UUID.
- `404 NOT_FOUND`: no invoice has the requested UUID.
- `409 INVOICE_NOT_EDITABLE`: the invoice is no longer `DRAFT`.

## Invoice status actions

Status changes use explicit action endpoints. Each request has no body; unknown
body fields are rejected.

```text
POST /invoices/:id/send          DRAFT   -> SENT
POST /invoices/:id/mark-overdue  SENT    -> OVERDUE
POST /invoices/:id/mark-paid     SENT    -> PAID
POST /invoices/:id/mark-paid     OVERDUE -> PAID
```

An invoice may become `OVERDUE` only after its `dueDate`; the due date itself is
not overdue. `PAID` is terminal and no transition can return an invoice to an
earlier status. Status changes preserve all financial fields and line items.

Success: HTTP `200` with `{ "data": invoice }` containing the updated status
and timestamp.

Relevant errors:

- `400 VALIDATION_ERROR`: invalid route parameter or a non-empty action body.
- `404 NOT_FOUND`: no invoice has the requested UUID.
- `409 INVALID_STATUS_TRANSITION`: the current status cannot move to the
  requested status.
- `409 INVOICE_NOT_OVERDUE`: the due date has not passed.

Status validation and persistence execute while the invoice row is locked in a
single transaction. Concurrent duplicate actions therefore cannot both succeed.

## Download invoice PDF

`GET /invoices/:id/pdf`

The endpoint returns an A4 `application/pdf` document with an attachment file
name derived from the invoice number. The PDF contains issuer details, client
billing information, dates, ordered line items, server-calculated totals,
notes, and page numbers. Long invoices repeat the table header across pages.

PDF generation is available only after an invoice has left `DRAFT`, ensuring
the downloaded document represents an issued record.

Relevant errors:

- `400 VALIDATION_ERROR`: the route parameter is not a UUID.
- `404 NOT_FOUND`: no invoice has the requested UUID.
- `409 INVOICE_PDF_UNAVAILABLE`: the invoice is still `DRAFT`.
