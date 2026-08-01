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
