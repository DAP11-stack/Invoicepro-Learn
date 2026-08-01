import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { PostgresClientRepository } from "../src/clients/repository.js";
import { checkDatabaseHealth, pool } from "../src/db/pool.js";
import { PostgresInvoiceRepository } from "../src/invoices/repository.js";
import { InvoiceApplicationService } from "../src/invoices/service.js";

const clientRepository = new PostgresClientRepository(pool);
const invoiceRepository = new PostgresInvoiceRepository(pool);
const invoiceService = new InvoiceApplicationService(invoiceRepository);
const app = createApp({ healthCheck: checkDatabaseHealth, clientService: clientRepository, invoiceService });
const clientIds = new Set<string>();
const invoiceIds = new Set<string>();

async function cleanCreatedRecords() {
  if (invoiceIds.size > 0) {
    await pool.query("DELETE FROM invoices WHERE id = ANY($1::uuid[])", [[...invoiceIds]]);
    invoiceIds.clear();
  }
  if (clientIds.size > 0) {
    await pool.query("DELETE FROM clients WHERE id = ANY($1::uuid[])", [[...clientIds]]);
    clientIds.clear();
  }
}

async function createTestClient(marker: string): Promise<string> {
  const client = await clientRepository.create({
    businessName: `PT Invoice Integration ${marker}`,
    email: `invoice-${marker}@example.test`,
    billingAddress: "Jl. Invoice Integration 1, Jakarta"
  });
  clientIds.add(client.id);
  return client.id;
}

beforeAll(checkDatabaseHealth);
afterEach(cleanCreatedRecords);
afterAll(async () => {
  await cleanCreatedRecords();
  await pool.end();
});

describe("Invoice API with PostgreSQL", () => {
  it("calculates, numbers, and persists invoice header and items atomically", async () => {
    const clientId = await createTestClient(randomUUID());
    const response = await request(app).post("/api/v1/invoices").send({
      clientId,
      issueDate: "2026-08-01",
      dueDate: "2026-08-31",
      currency: "IDR",
      taxRate: "11",
      notes: "Integration invoice",
      items: [
        { description: "Item A", quantity: "2", unitPrice: "100000.00" },
        { description: "Item B", quantity: "1", unitPrice: "50000.00" }
      ]
    });

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        clientId,
        invoiceNumber: expect.stringMatching(/^INV-202608-\d{6,}$/),
        status: "DRAFT",
        subtotal: "250000.00",
        taxTotal: "27500.00",
        grandTotal: "277500.00"
      })
    );
    expect(response.body.data.items).toEqual([
      expect.objectContaining({ position: 1, lineTotal: "200000.00" }),
      expect.objectContaining({ position: 2, lineTotal: "50000.00" })
    ]);
    invoiceIds.add(response.body.data.id as string);

    const persisted = await pool.query<{
      subtotal: string;
      tax_total: string;
      grand_total: string;
      item_count: number;
    }>(
      `SELECT i.subtotal, i.tax_total, i.grand_total, count(ii.id)::int AS item_count
       FROM invoices i
       JOIN invoice_items ii ON ii.invoice_id = i.id
       WHERE i.id = $1
       GROUP BY i.id`,
      [response.body.data.id]
    );
    expect(persisted.rows[0]).toEqual({
      subtotal: "250000.00",
      tax_total: "27500.00",
      grand_total: "277500.00",
      item_count: 2
    });
  });

  it("rolls back the invoice header when item insertion fails", async () => {
    const marker = randomUUID();
    const clientId = await createTestClient(marker);

    await expect(
      invoiceRepository.create({
        clientId,
        issueDate: "2026-08-01",
        dueDate: "2026-08-31",
        currency: "IDR",
        taxRate: "0.00",
        subtotal: "20.00",
        taxTotal: "0.00",
        grandTotal: "20.00",
        notes: `Rollback ${marker}`,
        items: [
          {
            description: "First",
            quantity: "1.000",
            unitPrice: "10.00",
            lineTotal: "10.00",
            position: 1
          },
          {
            description: "Duplicate position",
            quantity: "1.000",
            unitPrice: "10.00",
            lineTotal: "10.00",
            position: 1
          }
        ]
      })
    ).rejects.toMatchObject({ code: "23505" });

    const invoiceCount = await pool.query<{ total: number }>(
      "SELECT count(*)::int AS total FROM invoices WHERE notes = $1",
      [`Rollback ${marker}`]
    );
    expect(invoiceCount.rows[0]?.total).toBe(0);
  });

  it("lists filtered invoices and returns complete persisted detail", async () => {
    const marker = randomUUID();
    const clientId = await createTestClient(marker);
    const payload = {
      clientId,
      issueDate: "2026-08-01",
      dueDate: "2026-08-31",
      taxRate: "11",
      items: [
        { description: "First position", quantity: "1", unitPrice: "100" },
        { description: "Second position", quantity: "2", unitPrice: "50" }
      ]
    };
    const createdResponses = await Promise.all([
      request(app).post("/api/v1/invoices").send(payload),
      request(app).post("/api/v1/invoices").send(payload)
    ]);
    for (const response of createdResponses) invoiceIds.add(response.body.data.id as string);

    const page = await request(app).get(
      `/api/v1/invoices?limit=1&offset=0&status=DRAFT&clientId=${clientId}`
    );
    const emptyPage = await request(app).get(
      `/api/v1/invoices?limit=1&offset=100&status=DRAFT&clientId=${clientId}`
    );
    const detail = await request(app).get(`/api/v1/invoices/${createdResponses[0]!.body.data.id}`);

    expect(page.status).toBe(200);
    expect(page.body.data).toHaveLength(1);
    expect(page.body.data[0]).not.toHaveProperty("items");
    expect(page.body.data[0].client).toEqual(
      expect.objectContaining({
        id: clientId,
        businessName: `PT Invoice Integration ${marker}`
      })
    );
    expect(page.body.pagination).toEqual({ limit: 1, offset: 0, total: 2 });
    expect(emptyPage.body).toEqual({
      data: [],
      pagination: { limit: 1, offset: 100, total: 2 }
    });

    expect(detail.status).toBe(200);
    expect(detail.body.data.client).toEqual(
      expect.objectContaining({
        id: clientId,
        businessName: `PT Invoice Integration ${marker}`,
        billingAddress: "Jl. Invoice Integration 1, Jakarta"
      })
    );
    expect(detail.body.data.items.map((item: { position: number }) => item.position)).toEqual([1, 2]);
  });

  it("generates unique invoice numbers for concurrent requests", async () => {
    const clientId = await createTestClient(randomUUID());
    const payload = {
      clientId,
      issueDate: "2026-08-01",
      dueDate: "2026-08-31",
      items: [{ description: "Concurrent item", quantity: "1", unitPrice: "10" }]
    };

    const responses = await Promise.all([
      request(app).post("/api/v1/invoices").send(payload),
      request(app).post("/api/v1/invoices").send(payload)
    ]);

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    for (const response of responses) invoiceIds.add(response.body.data.id as string);
    expect(new Set(responses.map((response) => response.body.data.invoiceNumber)).size).toBe(2);
  });

  it("returns not found without persisting an invoice for an unknown client", async () => {
    const before = await pool.query<{ total: number }>("SELECT count(*)::int AS total FROM invoices");
    const response = await request(app).post("/api/v1/invoices").send({
      clientId: randomUUID(),
      issueDate: "2026-08-01",
      dueDate: "2026-08-31",
      items: [{ description: "Unknown client", quantity: "1", unitPrice: "10" }]
    });
    const after = await pool.query<{ total: number }>("SELECT count(*)::int AS total FROM invoices");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(after.rows[0]?.total).toBe(before.rows[0]?.total);
  });

  it("updates a draft invoice and recalculates its persisted items and totals", async () => {
    const clientId = await createTestClient(randomUUID());
    const created = await request(app).post("/api/v1/invoices").send({
      clientId,
      issueDate: "2026-08-01",
      dueDate: "2026-08-31",
      taxRate: "0",
      items: [{ description: "Original", quantity: "1", unitPrice: "100" }]
    });
    const invoiceId = created.body.data.id as string;
    invoiceIds.add(invoiceId);

    const updated = await request(app).patch(`/api/v1/invoices/${invoiceId}`).send({
      dueDate: "2026-09-15",
      currency: "usd",
      taxRate: "10",
      notes: "Updated draft",
      items: [
        { description: "Updated A", quantity: "2", unitPrice: "25" },
        { description: "Updated B", quantity: "3", unitPrice: "10" }
      ]
    });

    expect(updated.status).toBe(200);
    expect(updated.body.data).toEqual(
      expect.objectContaining({
        id: invoiceId,
        invoiceNumber: created.body.data.invoiceNumber,
        status: "DRAFT",
        dueDate: "2026-09-15",
        currency: "USD",
        subtotal: "80.00",
        taxTotal: "8.00",
        grandTotal: "88.00",
        notes: "Updated draft"
      })
    );
    expect(updated.body.data.items).toEqual([
      expect.objectContaining({ position: 1, lineTotal: "50.00" }),
      expect.objectContaining({ position: 2, lineTotal: "30.00" })
    ]);

    const persisted = await request(app).get(`/api/v1/invoices/${invoiceId}`);
    const { client: _client, ...persistedInvoice } = persisted.body.data;
    expect(persistedInvoice).toEqual(updated.body.data);
  });

  it("rolls back a draft update when merged dates or the target client are invalid", async () => {
    const clientId = await createTestClient(randomUUID());
    const created = await request(app).post("/api/v1/invoices").send({
      clientId,
      issueDate: "2026-08-10",
      dueDate: "2026-08-31",
      items: [{ description: "Unchanged", quantity: "1", unitPrice: "100" }]
    });
    const invoiceId = created.body.data.id as string;
    invoiceIds.add(invoiceId);

    const invalidDate = await request(app)
      .patch(`/api/v1/invoices/${invoiceId}`)
      .send({ dueDate: "2026-08-01" });
    const unknownClient = await request(app)
      .patch(`/api/v1/invoices/${invoiceId}`)
      .send({ clientId: randomUUID() });
    const persisted = await request(app).get(`/api/v1/invoices/${invoiceId}`);

    expect(invalidDate.status).toBe(400);
    expect(invalidDate.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "dueDate" })])
    );
    expect(unknownClient.status).toBe(404);
    const { client: _client, ...persistedInvoice } = persisted.body.data;
    expect(persistedInvoice).toEqual(created.body.data);
  });

  it("deletes a draft invoice and cascades its line items", async () => {
    const clientId = await createTestClient(randomUUID());
    const created = await request(app).post("/api/v1/invoices").send({
      clientId,
      issueDate: "2026-08-01",
      dueDate: "2026-08-31",
      items: [{ description: "Delete me", quantity: "1", unitPrice: "100" }]
    });
    const invoiceId = created.body.data.id as string;
    invoiceIds.add(invoiceId);

    const deleted = await request(app).delete(`/api/v1/invoices/${invoiceId}`);
    invoiceIds.delete(invoiceId);
    const missing = await request(app).get(`/api/v1/invoices/${invoiceId}`);
    const itemCount = await pool.query<{ total: number }>(
      "SELECT count(*)::int AS total FROM invoice_items WHERE invoice_id = $1",
      [invoiceId]
    );

    expect(deleted.status).toBe(204);
    expect(missing.status).toBe(404);
    expect(itemCount.rows[0]?.total).toBe(0);
  });

  it("rejects updates and deletes after an invoice leaves draft status", async () => {
    const clientId = await createTestClient(randomUUID());
    const created = await request(app).post("/api/v1/invoices").send({
      clientId,
      issueDate: "2026-08-01",
      dueDate: "2026-08-31",
      items: [{ description: "Locked", quantity: "1", unitPrice: "100" }]
    });
    const invoiceId = created.body.data.id as string;
    invoiceIds.add(invoiceId);
    await pool.query("UPDATE invoices SET status = 'SENT' WHERE id = $1", [invoiceId]);

    const update = await request(app)
      .patch(`/api/v1/invoices/${invoiceId}`)
      .send({ notes: "Must not change" });
    const deletion = await request(app).delete(`/api/v1/invoices/${invoiceId}`);
    const persisted = await request(app).get(`/api/v1/invoices/${invoiceId}`);

    expect(update.status).toBe(409);
    expect(update.body.error.code).toBe("INVOICE_NOT_EDITABLE");
    expect(deletion.status).toBe(409);
    expect(deletion.body.error.code).toBe("INVOICE_NOT_EDITABLE");
    expect(persisted.body.data.status).toBe("SENT");
    expect(persisted.body.data.notes).toBeNull();
  });

  it("persists the full draft to sent to overdue to paid workflow", async () => {
    const clientId = await createTestClient(randomUUID());
    const created = await request(app).post("/api/v1/invoices").send({
      clientId,
      issueDate: "2026-01-01",
      dueDate: "2026-01-31",
      items: [{ description: "Past due", quantity: "1", unitPrice: "100" }]
    });
    const invoiceId = created.body.data.id as string;
    invoiceIds.add(invoiceId);

    const sent = await request(app).post(`/api/v1/invoices/${invoiceId}/send`);
    const overdue = await request(app).post(`/api/v1/invoices/${invoiceId}/mark-overdue`);
    const paid = await request(app).post(`/api/v1/invoices/${invoiceId}/mark-paid`);
    const persisted = await request(app).get(`/api/v1/invoices/${invoiceId}`);

    expect(sent.status).toBe(200);
    expect(sent.body.data.status).toBe("SENT");
    expect(overdue.status).toBe(200);
    expect(overdue.body.data.status).toBe("OVERDUE");
    expect(paid.status).toBe(200);
    expect(paid.body.data.status).toBe("PAID");
    expect(persisted.body.data.status).toBe("PAID");
  });

  it("allows a sent invoice to be paid without passing through overdue", async () => {
    const clientId = await createTestClient(randomUUID());
    const created = await request(app).post("/api/v1/invoices").send({
      clientId,
      issueDate: "2026-08-01",
      dueDate: "2099-08-31",
      items: [{ description: "Paid on time", quantity: "1", unitPrice: "100" }]
    });
    const invoiceId = created.body.data.id as string;
    invoiceIds.add(invoiceId);

    await request(app).post(`/api/v1/invoices/${invoiceId}/send`);
    const paid = await request(app).post(`/api/v1/invoices/${invoiceId}/mark-paid`);

    expect(paid.status).toBe(200);
    expect(paid.body.data.status).toBe("PAID");
  });

  it("rejects invalid draft transitions without changing persisted status", async () => {
    const clientId = await createTestClient(randomUUID());
    const created = await request(app).post("/api/v1/invoices").send({
      clientId,
      issueDate: "2026-01-01",
      dueDate: "2026-01-31",
      items: [{ description: "Still draft", quantity: "1", unitPrice: "100" }]
    });
    const invoiceId = created.body.data.id as string;
    invoiceIds.add(invoiceId);

    const paid = await request(app).post(`/api/v1/invoices/${invoiceId}/mark-paid`);
    const overdue = await request(app).post(`/api/v1/invoices/${invoiceId}/mark-overdue`);
    const persisted = await request(app).get(`/api/v1/invoices/${invoiceId}`);

    expect(paid.status).toBe(409);
    expect(paid.body.error.code).toBe("INVALID_STATUS_TRANSITION");
    expect(overdue.status).toBe(409);
    expect(overdue.body.error.code).toBe("INVALID_STATUS_TRANSITION");
    expect(persisted.body.data.status).toBe("DRAFT");
  });

  it("keeps a sent invoice out of overdue status until its due date has passed", async () => {
    const clientId = await createTestClient(randomUUID());
    const created = await request(app).post("/api/v1/invoices").send({
      clientId,
      issueDate: "2026-08-01",
      dueDate: "2099-08-31",
      items: [{ description: "Not due", quantity: "1", unitPrice: "100" }]
    });
    const invoiceId = created.body.data.id as string;
    invoiceIds.add(invoiceId);

    await request(app).post(`/api/v1/invoices/${invoiceId}/send`);
    const overdue = await request(app).post(`/api/v1/invoices/${invoiceId}/mark-overdue`);
    const persisted = await request(app).get(`/api/v1/invoices/${invoiceId}`);

    expect(overdue.status).toBe(409);
    expect(overdue.body.error.code).toBe("INVOICE_NOT_OVERDUE");
    expect(persisted.body.data.status).toBe("SENT");
  });

  it("serializes concurrent duplicate send actions", async () => {
    const clientId = await createTestClient(randomUUID());
    const created = await request(app).post("/api/v1/invoices").send({
      clientId,
      issueDate: "2026-08-01",
      dueDate: "2026-08-31",
      items: [{ description: "Send once", quantity: "1", unitPrice: "100" }]
    });
    const invoiceId = created.body.data.id as string;
    invoiceIds.add(invoiceId);

    const responses = await Promise.all([
      request(app).post(`/api/v1/invoices/${invoiceId}/send`),
      request(app).post(`/api/v1/invoices/${invoiceId}/send`)
    ]);
    const persisted = await request(app).get(`/api/v1/invoices/${invoiceId}`);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(persisted.body.data.status).toBe("SENT");
  });

  it("generates a PDF only after the invoice has been sent", async () => {
    const clientId = await createTestClient(randomUUID());
    const created = await request(app).post("/api/v1/invoices").send({
      clientId,
      issueDate: "2026-08-01",
      dueDate: "2026-08-31",
      taxRate: "11",
      notes: "PDF integration verification",
      items: [
        { description: "Design service", quantity: "2", unitPrice: "125000" },
        { description: "Print preparation", quantity: "1", unitPrice: "50000" }
      ]
    });
    const invoiceId = created.body.data.id as string;
    invoiceIds.add(invoiceId);

    const draftPdf = await request(app).get(`/api/v1/invoices/${invoiceId}/pdf`);
    await request(app).post(`/api/v1/invoices/${invoiceId}/send`);
    const issuedPdf = await request(app).get(`/api/v1/invoices/${invoiceId}/pdf`);

    expect(draftPdf.status).toBe(409);
    expect(draftPdf.body.error.code).toBe("INVOICE_PDF_UNAVAILABLE");
    expect(issuedPdf.status).toBe(200);
    expect(issuedPdf.headers["content-type"]).toBe("application/pdf");
    expect(issuedPdf.headers["content-disposition"]).toMatch(
      /^inline; filename="INV-202608-\d{6,}\.pdf"$/
    );
    expect(Buffer.isBuffer(issuedPdf.body)).toBe(true);
    expect(issuedPdf.body.subarray(0, 4).toString()).toBe("%PDF");
    expect(issuedPdf.body.length).toBeGreaterThan(1_000);
  });
});
