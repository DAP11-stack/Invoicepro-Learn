import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";

const unusedClientService = {
  list: async () => ({ data: [], pagination: { limit: 20, offset: 0, total: 0 } }),
  create: async () => {
    throw new Error("not used");
  },
  findById: async () => null,
  update: async () => null,
  delete: async () => false
};
const unusedInvoiceService = {
  create: async () => {
    throw new Error("not used");
  },
  update: async () => null,
  delete: async () => false,
  send: async () => null,
  markOverdue: async () => null,
  markPaid: async () => null,
  generatePdf: async () => null,
  list: async () => ({ data: [], pagination: { limit: 20, offset: 0, total: 0 } }),
  findById: async () => null
};

describe("GET /api/v1/health", () => {
  it("returns service and database health", async () => {
    const app = createApp({
      healthCheck: async () => undefined,
      clientService: unusedClientService,
      invoiceService: unusedInvoiceService
    });

    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      service: "invoicepro-api",
      database: "connected"
    });
  });

  it("returns a safe error when database health check fails", async () => {
    const app = createApp({
      healthCheck: async () => Promise.reject(new Error("connection failed")),
      clientService: unusedClientService,
      invoiceService: unusedInvoiceService
    });

    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: {
        code: "DATABASE_UNAVAILABLE",
        message: "Database is unavailable."
      }
    });
  });
});

describe("API error contract", () => {
  it("returns a validation error for malformed JSON", async () => {
    const app = createApp({
      healthCheck: async () => undefined,
      clientService: unusedClientService,
      invoiceService: unusedInvoiceService
    });

    const response = await request(app)
      .post("/api/v1/clients")
      .set("Content-Type", "application/json")
      .send("{invalid json");

    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: "VALIDATION_ERROR",
      message: "Request body contains invalid JSON.",
      details: []
    });
  });

  it("returns a JSON error for an unknown API route", async () => {
    const app = createApp({
      healthCheck: async () => undefined,
      clientService: unusedClientService,
      invoiceService: unusedInvoiceService
    });

    const response = await request(app).get("/api/v1/not-a-route");

    expect(response.status).toBe(404);
    expect(response.type).toBe("application/json");
    expect(response.body.error).toEqual({
      code: "NOT_FOUND",
      message: "API route was not found."
    });
  });
});
