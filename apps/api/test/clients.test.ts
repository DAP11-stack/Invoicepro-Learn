import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import type { Client, ClientService } from "../src/clients/types.js";

const clientId = "8ee050d9-c8f5-48c8-8508-fc4ebd4237d5";
const client: Client = {
  id: clientId,
  businessName: "PT Contoh Jaya",
  contactName: "Rani",
  email: "rani@contoh.test",
  phone: "+628123456789",
  billingAddress: "Jl. Contoh 1, Jakarta",
  taxId: "01.234.567.8-901.000",
  createdAt: "2026-07-27T12:00:00.000Z",
  updatedAt: "2026-07-27T12:00:00.000Z"
};
const unusedInvoiceService = {
  create: async () => {
    throw new Error("not used");
  },
  update: async () => null,
  delete: async () => false,
  list: async () => ({ data: [], pagination: { limit: 20, offset: 0, total: 0 } }),
  findById: async () => null
};

function makeClientService(overrides: Partial<ClientService> = {}): ClientService {
  return {
    list: vi.fn(async (limit: number, offset: number) => ({
      data: [client],
      pagination: { limit, offset, total: 1 }
    })),
    create: vi.fn(async () => client),
    findById: vi.fn(async () => client),
    update: vi.fn(async () => client),
    delete: vi.fn(async () => true),
    ...overrides
  };
}

function makeApp(clientService: ClientService) {
  return createApp({
    healthCheck: async () => undefined,
    clientService,
    invoiceService: unusedInvoiceService
  });
}

describe("client API", () => {
  it("creates a valid client", async () => {
    const clientService = makeClientService();
    const response = await request(makeApp(clientService)).post("/api/v1/clients").send({
      businessName: "PT Contoh Jaya",
      contactName: "Rani",
      email: "rani@contoh.test",
      phone: "+628123456789",
      billingAddress: "Jl. Contoh 1, Jakarta",
      taxId: "01.234.567.8-901.000"
    });

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual(client);
    expect(clientService.create).toHaveBeenCalledWith({
      businessName: "PT Contoh Jaya",
      contactName: "Rani",
      email: "rani@contoh.test",
      phone: "+628123456789",
      billingAddress: "Jl. Contoh 1, Jakarta",
      taxId: "01.234.567.8-901.000"
    });
  });

  it("rejects invalid client input", async () => {
    const response = await request(makeApp(makeClientService())).post("/api/v1/clients").send({
      businessName: "",
      email: "not-an-email",
      billingAddress: ""
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "businessName" }),
        expect.objectContaining({ path: "email" }),
        expect.objectContaining({ path: "billingAddress" })
      ])
    );
  });

  it("lists clients with bounded pagination", async () => {
    const clientService = makeClientService();
    const app = makeApp(clientService);

    const response = await request(app).get("/api/v1/clients?limit=10&offset=5");
    const invalidResponse = await request(app).get("/api/v1/clients?limit=101");

    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({ limit: 10, offset: 5, total: 1 });
    expect(clientService.list).toHaveBeenCalledWith(10, 5);
    expect(invalidResponse.status).toBe(400);
    expect(invalidResponse.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns not found for an unknown client", async () => {
    const response = await request(
      makeApp(makeClientService({ findById: async () => null }))
    ).get(`/api/v1/clients/${clientId}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toEqual({ code: "NOT_FOUND", message: "Client was not found." });
  });

  it("stops after an invalid update id without validating or updating the body", async () => {
    const clientService = makeClientService();
    const response = await request(makeApp(clientService))
      .patch("/api/v1/clients/not-a-uuid")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(clientService.update).not.toHaveBeenCalled();
  });

  it("prevents deleting a client referenced by an invoice", async () => {
    const foreignKeyError = Object.assign(new Error("restrict violation"), { code: "23001" });
    const response = await request(
      makeApp(makeClientService({ delete: async () => Promise.reject(foreignKeyError) }))
    ).delete(`/api/v1/clients/${clientId}`);

    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({
      code: "CLIENT_IN_USE",
      message: "Client is referenced by an invoice."
    });
  });

  it("does not misclassify foreign-key errors from other client operations", async () => {
    const foreignKeyError = Object.assign(new Error("foreign key violation"), { code: "23503" });
    const response = await request(
      makeApp(makeClientService({ create: async () => Promise.reject(foreignKeyError) }))
    )
      .post("/api/v1/clients")
      .send({
        businessName: "PT Contoh Jaya",
        email: "rani@contoh.test",
        billingAddress: "Jl. Contoh 1, Jakarta"
      });

    expect(response.status).toBe(500);
    expect(response.body.error).toEqual({
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred."
    });
  });
});
