import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import type { ClientService } from "../src/clients/types.js";
import { ClientNotFoundError, InvoiceNotEditableError } from "../src/invoices/errors.js";
import type { Invoice, InvoiceDetail, InvoiceListItem, InvoiceService } from "../src/invoices/types.js";

const clientId = "8ee050d9-c8f5-48c8-8508-fc4ebd4237d5";
const invoice: Invoice = {
  id: "d3cad93f-9b43-4327-a234-1811efdd4668",
  clientId,
  invoiceNumber: "INV-202608-000001",
  issueDate: "2026-08-01",
  dueDate: "2026-08-31",
  status: "DRAFT",
  currency: "IDR",
  taxRate: "11.00",
  subtotal: "250000.00",
  taxTotal: "27500.00",
  grandTotal: "277500.00",
  notes: null,
  items: [],
  createdAt: "2026-08-01T09:00:00.000Z",
  updatedAt: "2026-08-01T09:00:00.000Z"
};
const { items: _invoiceItems, ...invoiceSummary } = invoice;
const invoiceListItem: InvoiceListItem = {
  ...invoiceSummary,
  client: {
    id: clientId,
    businessName: "PT Contoh Jaya",
    email: "rani@contoh.test"
  }
};
const invoiceDetail: InvoiceDetail = {
  ...invoice,
  client: {
    id: clientId,
    businessName: "PT Contoh Jaya",
    contactName: "Rani",
    email: "rani@contoh.test",
    phone: "+628123456789",
    billingAddress: "Jl. Contoh 1, Jakarta",
    taxId: "01.234.567.8-901.000"
  }
};
const unusedClientService: ClientService = {
  list: async () => ({ data: [], pagination: { limit: 20, offset: 0, total: 0 } }),
  create: async () => {
    throw new Error("not used");
  },
  findById: async () => null,
  update: async () => null,
  delete: async () => false
};

function makeInvoiceService(overrides: Partial<InvoiceService> = {}): InvoiceService {
  return {
    create: vi.fn(async () => invoice),
    update: vi.fn(async () => invoice),
    delete: vi.fn(async () => true),
    list: vi.fn(async (filters) => ({
      data: [invoiceListItem],
      pagination: { limit: filters.limit, offset: filters.offset, total: 1 }
    })),
    findById: vi.fn(async () => invoiceDetail),
    ...overrides
  };
}

function makeApp(invoiceService: InvoiceService) {
  return createApp({
    healthCheck: async () => undefined,
    clientService: unusedClientService,
    invoiceService
  });
}

const validInput = {
  clientId,
  issueDate: "2026-08-01",
  dueDate: "2026-08-31",
  currency: "idr",
  taxRate: 11,
  items: [
    { description: "Item A", quantity: 2, unitPrice: 100000 },
    { description: "Item B", quantity: "1", unitPrice: "50000.00" }
  ]
};

describe("invoice API", () => {
  it("lists invoices with validated pagination and filters", async () => {
    const invoiceService = makeInvoiceService();
    const response = await request(makeApp(invoiceService)).get(
      `/api/v1/invoices?limit=10&offset=5&status=PAID&clientId=${clientId}`
    );

    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({ limit: 10, offset: 5, total: 1 });
    expect(invoiceService.list).toHaveBeenCalledWith({
      limit: 10,
      offset: 5,
      status: "PAID",
      clientId
    });
  });

  it("rejects invalid or unknown list filters", async () => {
    const app = makeApp(makeInvoiceService());
    const invalidStatus = await request(app).get("/api/v1/invoices?status=UNKNOWN");
    const unknownFilter = await request(app).get("/api/v1/invoices?sort=total");
    const unsafeOffset = await request(app).get("/api/v1/invoices?offset=999999999999999999999");

    expect(invalidStatus.status).toBe(400);
    expect(invalidStatus.body.error.code).toBe("VALIDATION_ERROR");
    expect(unknownFilter.status).toBe(400);
    expect(unknownFilter.body.error.code).toBe("VALIDATION_ERROR");
    expect(unsafeOffset.status).toBe(400);
    expect(unsafeOffset.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns invoice detail and validates the invoice id", async () => {
    const app = makeApp(makeInvoiceService());
    const response = await request(app).get(`/api/v1/invoices/${invoice.id}`);
    const invalid = await request(app).get("/api/v1/invoices/not-a-uuid");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(invoiceDetail);
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.message).toBe("Invoice id is invalid.");
  });

  it("returns not found for an unknown invoice", async () => {
    const response = await request(
      makeApp(makeInvoiceService({ findById: async () => null }))
    ).get(`/api/v1/invoices/${invoice.id}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toEqual({ code: "NOT_FOUND", message: "Invoice was not found." });
  });

  it("normalizes and creates a valid invoice", async () => {
    const invoiceService = makeInvoiceService();
    const response = await request(makeApp(invoiceService)).post("/api/v1/invoices").send(validInput);

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual(invoice);
    expect(invoiceService.create).toHaveBeenCalledWith({
      clientId,
      issueDate: "2026-08-01",
      dueDate: "2026-08-31",
      currency: "IDR",
      taxRate: "11",
      items: [
        { description: "Item A", quantity: "2", unitPrice: "100000" },
        { description: "Item B", quantity: "1", unitPrice: "50000.00" }
      ]
    });
  });

  it("rejects client-supplied totals", async () => {
    const invoiceService = makeInvoiceService();
    const response = await request(makeApp(invoiceService))
      .post("/api/v1/invoices")
      .send({ ...validInput, subtotal: "1.00", grandTotal: "1.00" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(invoiceService.create).not.toHaveBeenCalled();
  });

  it("rejects a non-alphabetic currency code", async () => {
    const response = await request(makeApp(makeInvoiceService()))
      .post("/api/v1/invoices")
      .send({ ...validInput, currency: "123" });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "currency" })])
    );
  });

  it("rejects invalid dates, empty items, and negative money", async () => {
    const response = await request(makeApp(makeInvoiceService()))
      .post("/api/v1/invoices")
      .send({
        ...validInput,
        issueDate: "2026-08-31",
        dueDate: "2026-08-01",
        items: [{ description: "Invalid", quantity: "0", unitPrice: "-1" }]
      });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "dueDate" }),
        expect.objectContaining({ path: "items.0.quantity" }),
        expect.objectContaining({ path: "items.0.unitPrice" })
      ])
    );
  });

  it("rejects year zero before the request reaches PostgreSQL", async () => {
    const response = await request(makeApp(makeInvoiceService()))
      .post("/api/v1/invoices")
      .send({ ...validInput, issueDate: "0000-01-01", dueDate: "0000-01-02" });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "issueDate" })])
    );
  });

  it("returns not found when the selected client does not exist", async () => {
    const response = await request(
      makeApp(makeInvoiceService({ create: async () => Promise.reject(new ClientNotFoundError()) }))
    )
      .post("/api/v1/invoices")
      .send(validInput);

    expect(response.status).toBe(404);
    expect(response.body.error).toEqual({ code: "NOT_FOUND", message: "Client was not found." });
  });

  it("normalizes an invoice patch and rejects client-supplied totals", async () => {
    const invoiceService = makeInvoiceService();
    const updated = await request(makeApp(invoiceService))
      .patch(`/api/v1/invoices/${invoice.id}`)
      .send({ currency: "usd", taxRate: 5, notes: null });
    const forbidden = await request(makeApp(invoiceService))
      .patch(`/api/v1/invoices/${invoice.id}`)
      .send({ subtotal: "1.00" });

    expect(updated.status).toBe(200);
    expect(invoiceService.update).toHaveBeenCalledWith(invoice.id, {
      currency: "USD",
      taxRate: "5",
      notes: null
    });
    expect(forbidden.status).toBe(400);
    expect(forbidden.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an empty invoice patch", async () => {
    const invoiceService = makeInvoiceService();
    const response = await request(makeApp(invoiceService))
      .patch(`/api/v1/invoices/${invoice.id}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: "At least one invoice field must be provided." })
      ])
    );
    expect(invoiceService.update).not.toHaveBeenCalled();
  });

  it("maps missing and non-editable invoice updates to 404 and 409", async () => {
    const missing = await request(makeApp(makeInvoiceService({ update: async () => null })))
      .patch(`/api/v1/invoices/${invoice.id}`)
      .send({ notes: "Updated" });
    const locked = await request(
      makeApp(
        makeInvoiceService({
          update: async () => Promise.reject(new InvoiceNotEditableError())
        })
      )
    )
      .patch(`/api/v1/invoices/${invoice.id}`)
      .send({ notes: "Updated" });

    expect(missing.status).toBe(404);
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe("INVOICE_NOT_EDITABLE");
  });

  it("deletes a draft invoice with an empty 204 response", async () => {
    const invoiceService = makeInvoiceService();
    const response = await request(makeApp(invoiceService)).delete(
      `/api/v1/invoices/${invoice.id}`
    );

    expect(response.status).toBe(204);
    expect(response.text).toBe("");
    expect(invoiceService.delete).toHaveBeenCalledWith(invoice.id);
  });

  it("maps missing and non-editable invoice deletes to 404 and 409", async () => {
    const missing = await request(makeApp(makeInvoiceService({ delete: async () => false }))).delete(
      `/api/v1/invoices/${invoice.id}`
    );
    const locked = await request(
      makeApp(
        makeInvoiceService({
          delete: async () => Promise.reject(new InvoiceNotEditableError())
        })
      )
    ).delete(`/api/v1/invoices/${invoice.id}`);

    expect(missing.status).toBe(404);
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe("INVOICE_NOT_EDITABLE");
  });
});
