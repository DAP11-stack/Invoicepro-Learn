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
});
