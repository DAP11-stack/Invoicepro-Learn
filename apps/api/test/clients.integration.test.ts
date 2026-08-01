import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { PostgresClientRepository } from "../src/clients/repository.js";
import { checkDatabaseHealth, pool } from "../src/db/pool.js";

const clientRepository = new PostgresClientRepository(pool);
const unusedInvoiceService = {
  create: async () => {
    throw new Error("not used");
  },
  update: async () => null,
  delete: async () => false,
  list: async () => ({ data: [], pagination: { limit: 20, offset: 0, total: 0 } }),
  findById: async () => null
};
const app = createApp({
  healthCheck: checkDatabaseHealth,
  clientService: clientRepository,
  invoiceService: unusedInvoiceService
});
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

beforeAll(async () => {
  await checkDatabaseHealth();
});

afterEach(async () => {
  await cleanCreatedRecords();
});

afterAll(async () => {
  await cleanCreatedRecords();
  await pool.end();
});

describe("Client API with PostgreSQL", () => {
  it("persists the complete create, read, update, list, and delete workflow", async () => {
    const uniqueValue = randomUUID();
    const created = await request(app).post("/api/v1/clients").send({
      businessName: `PT Integration ${uniqueValue}`,
      contactName: "Integration Tester",
      email: `integration-${uniqueValue}@example.test`,
      billingAddress: "Jl. Integration 1, Jakarta"
    });

    expect(created.status).toBe(201);
    const clientId = created.body.data.id as string;
    clientIds.add(clientId);

    const fetched = await request(app).get(`/api/v1/clients/${clientId}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.email).toBe(`integration-${uniqueValue}@example.test`);

    const updated = await request(app)
      .patch(`/api/v1/clients/${clientId}`)
      .send({ businessName: `PT Integration Updated ${uniqueValue}`, phone: "+628123456789" });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toEqual(
      expect.objectContaining({
        id: clientId,
        businessName: `PT Integration Updated ${uniqueValue}`,
        phone: "+628123456789"
      })
    );

    const listed = await request(app).get("/api/v1/clients?limit=100&offset=0");
    expect(listed.status).toBe(200);
    expect(listed.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: clientId })])
    );

    const deleted = await request(app).delete(`/api/v1/clients/${clientId}`);
    expect(deleted.status).toBe(204);
    clientIds.delete(clientId);

    const missing = await request(app).get(`/api/v1/clients/${clientId}`);
    expect(missing.status).toBe(404);
  });

  it("rejects deletion when PostgreSQL reports an invoice reference", async () => {
    const uniqueValue = randomUUID();
    const created = await request(app).post("/api/v1/clients").send({
      businessName: `PT Referenced ${uniqueValue}`,
      email: `referenced-${uniqueValue}@example.test`,
      billingAddress: "Jl. Referenced 1, Jakarta"
    });

    expect(created.status).toBe(201);
    const clientId = created.body.data.id as string;
    clientIds.add(clientId);

    const invoice = await pool.query<{ id: string }>(
      `INSERT INTO invoices (
        client_id, invoice_number, issue_date, due_date
      ) VALUES ($1, $2, CURRENT_DATE, CURRENT_DATE)
      RETURNING id`,
      [clientId, `TEST-${uniqueValue}`]
    );
    const invoiceId = invoice.rows[0]!.id;
    invoiceIds.add(invoiceId);

    const response = await request(app).delete(`/api/v1/clients/${clientId}`);

    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({
      code: "CLIENT_IN_USE",
      message: "Client is referenced by an invoice."
    });
  });
});
