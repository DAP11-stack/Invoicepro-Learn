# Local Browser Demo

This walkthrough demonstrates the complete InvoicePro workflow without a
hosted environment. It uses the same Express API, restricted PostgreSQL role,
and React interface covered by the automated test suite.

## Start the application

Configure `.env` and `.env.migration`, apply the migrations, and start the API:

```bash
npm run db:migrate
npm run dev:api
```

In a second terminal, start the React workspace:

```bash
npm run dev:web
```

Open `http://localhost:5173`.

## Guided workflow

1. Open **Clients** and create a billing client.
2. Return to **Invoices** and select that client.
3. Add one or more line items. The browser shows a preview while the API
   recalculates and persists the authoritative totals.
4. Create the invoice as `DRAFT` and review its detail panel.
5. Use **Send invoice** to move it to `SENT`.
6. Download the generated A4 PDF.
7. Mark the invoice `PAID`. A sent invoice can instead become `OVERDUE` only
   after its due date has passed.

## Automated browser journey

Install Chromium once and run the Playwright test:

```bash
npx playwright install chromium
npm run test:e2e
```

The test creates a uniquely identified client and invoice, verifies the
`DRAFT → SENT → PAID` journey, downloads a real PDF, checks its `%PDF` signature,
validates the responsive layout, and removes only its own records during
teardown. It does not truncate shared tables.

## Regenerate screenshots

On macOS or Linux:

```bash
CAPTURE_DEMO_SCREENSHOTS=1 npm run test:e2e
```

On PowerShell:

```powershell
$env:CAPTURE_DEMO_SCREENSHOTS = "1"
npm.cmd run test:e2e
Remove-Item Env:CAPTURE_DEMO_SCREENSHOTS
```

The command updates:

- `docs/screenshots/invoice-workspace-desktop.png`
- `docs/screenshots/invoice-detail-mobile.png`

Screenshot records use generated `example.test` addresses and are deleted from
PostgreSQL when the test finishes.

## Demo boundary

This version is designed for one trusted local operator. It does not claim to
provide production authentication, tenant isolation, hosted availability,
email delivery, or accounting/tax certification.
