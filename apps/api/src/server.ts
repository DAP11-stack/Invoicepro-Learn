import { createApp } from "./app.js";
import { PostgresClientRepository } from "./clients/repository.js";
import { environment } from "./config/env.js";
import { checkDatabaseHealth, pool } from "./db/pool.js";
import { PostgresInvoiceRepository } from "./invoices/repository.js";
import { PdfKitInvoiceRenderer } from "./invoices/pdf.js";
import { InvoiceApplicationService } from "./invoices/service.js";

const invoiceRepository = new PostgresInvoiceRepository(pool);

const app = createApp({
  healthCheck: checkDatabaseHealth,
  clientService: new PostgresClientRepository(pool),
  invoiceService: new InvoiceApplicationService(invoiceRepository, {
    pdfRenderer: new PdfKitInvoiceRenderer({
      name: environment.INVOICE_ISSUER_NAME,
      email: environment.INVOICE_ISSUER_EMAIL,
      address: environment.INVOICE_ISSUER_ADDRESS
    })
  })
});

const server = app.listen(environment.PORT, () => {
  console.log(`InvoicePro API listening on port ${environment.PORT}`);
});

async function closeServer(signal: string) {
  console.log(`${signal} received. Shutting down.`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.once("SIGINT", () => void closeServer("SIGINT"));
process.once("SIGTERM", () => void closeServer("SIGTERM"));
