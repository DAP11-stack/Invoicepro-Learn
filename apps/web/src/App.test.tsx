import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./api";
import { App } from "./App";
import type { Client, InvoiceDetail, InvoiceListItem, InvoiceRecord } from "./types";

vi.mock("./api", () => ({
  ApiError: class ApiError extends Error {
    details = [];
  },
  api: {
    listClients: vi.fn(),
    createClient: vi.fn(),
    updateClient: vi.fn(),
    deleteClient: vi.fn(),
    listInvoices: vi.fn(),
    getInvoice: vi.fn(),
    createInvoice: vi.fn(),
    updateInvoice: vi.fn(),
    deleteInvoice: vi.fn(),
    sendInvoice: vi.fn(),
    markInvoiceOverdue: vi.fn(),
    markInvoicePaid: vi.fn(),
    downloadInvoicePdf: vi.fn()
  }
}));

const client: Client = {
  id: "8ee050d9-c8f5-48c8-8508-fc4ebd4237d5",
  businessName: "PT Contoh Jaya",
  contactName: "Rani",
  email: "finance@example.test",
  phone: "+62 812 3456 7890",
  billingAddress: "Jl. Industri No. 10, Jakarta",
  taxId: null,
  createdAt: "2026-08-01T08:00:00.000Z",
  updatedAt: "2026-08-01T08:00:00.000Z"
};

const invoiceDetail: InvoiceDetail = {
  id: "d3cad93f-9b43-4327-a234-1811efdd4668",
  clientId: client.id,
  invoiceNumber: "INV-202608-000001",
  issueDate: "2026-08-01",
  dueDate: "2026-08-31",
  status: "DRAFT",
  currency: "IDR",
  taxRate: "11.00",
  subtotal: "100000.00",
  taxTotal: "11000.00",
  grandTotal: "111000.00",
  notes: null,
  items: [
    {
      id: "line-1",
      description: "Design service",
      quantity: "1.000",
      unitPrice: "100000.00",
      lineTotal: "100000.00",
      position: 1
    }
  ],
  client,
  createdAt: "2026-08-01T08:00:00.000Z",
  updatedAt: "2026-08-01T08:00:00.000Z"
};

const { items: _items, client: clientSummary, ...invoiceBase } = invoiceDetail;
const invoiceListItem: InvoiceListItem = {
  ...invoiceBase,
  client: {
    id: clientSummary.id,
    businessName: clientSummary.businessName,
    email: clientSummary.email
  }
};
const { client: _client, ...invoiceRecord } = invoiceDetail;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listClients).mockResolvedValue({
    data: [client],
    pagination: { limit: 100, offset: 0, total: 1 }
  });
  vi.mocked(api.listInvoices).mockResolvedValue({
    data: [invoiceListItem],
    pagination: { limit: 100, offset: 0, total: 1 }
  });
  vi.mocked(api.getInvoice).mockResolvedValue(invoiceDetail);
  vi.mocked(api.createClient).mockResolvedValue(client);
  vi.mocked(api.createInvoice).mockResolvedValue(invoiceRecord as InvoiceRecord);
  vi.mocked(api.sendInvoice).mockResolvedValue({ ...invoiceDetail, status: "SENT" });
});

describe("InvoicePro web workflow", () => {
  it("loads persisted invoices and runs the send action from detail", async () => {
    const user = userEvent.setup();
    render(<App />);

    const invoiceRow = await screen.findByRole("button", { name: /INV-202608-000001/ });
    await user.click(invoiceRow);
    expect(await screen.findByText("Design service")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Send invoice" }));
    await waitFor(() => expect(api.sendInvoice).toHaveBeenCalledTimes(1));
    expect(api.sendInvoice).toHaveBeenCalledWith(invoiceDetail.id);
  });

  it("creates a client from the browser form", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("INV-202608-000001");
    await user.click(screen.getByRole("button", { name: /Clients/ }));

    await user.clear(screen.getByLabelText("Business name"));
    await user.type(screen.getByLabelText("Business name"), "PT Browser Client");
    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), "browser@example.test");
    await user.clear(screen.getByLabelText("Billing address"));
    await user.type(screen.getByLabelText("Billing address"), "Jl. Browser 1");
    await user.click(screen.getByRole("button", { name: "Create client" }));

    await waitFor(() => expect(api.createClient).toHaveBeenCalledTimes(1));
    expect(api.createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        businessName: "PT Browser Client",
        contactName: null,
        email: "browser@example.test",
        phone: null,
        billingAddress: "Jl. Browser 1",
        taxId: null
      })
    );
  });

  it("downloads a PDF for an issued invoice", async () => {
    const user = userEvent.setup();
    const sentInvoice = { ...invoiceDetail, status: "SENT" as const };
    const sentListItem = { ...invoiceListItem, status: "SENT" as const };
    const blob = new Blob(["%PDF"], { type: "application/pdf" });
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    vi.mocked(api.listInvoices).mockResolvedValue({
      data: [sentListItem],
      pagination: { limit: 100, offset: 0, total: 1 }
    });
    vi.mocked(api.getInvoice).mockResolvedValue(sentInvoice);
    vi.mocked(api.downloadInvoicePdf).mockResolvedValue({
      blob,
      fileName: "INV-202608-000001.pdf"
    });

    render(<App />);
    await user.click(await screen.findByRole("button", { name: /INV-202608-000001/ }));
    await user.click(await screen.findByRole("button", { name: "Download PDF" }));

    await waitFor(() => expect(api.downloadInvoicePdf).toHaveBeenCalledWith(invoiceDetail.id));
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:invoice");
  });

  it("submits a server-authoritative draft invoice", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("INV-202608-000001");

    await user.type(screen.getByLabelText("Description"), "Browser workflow service");
    await user.type(screen.getByLabelText("Unit price"), "250000");
    const form = screen.getByRole("button", { name: "Create draft invoice" }).closest("form");
    expect(form).toBeTruthy();
    fireEvent.submit(form!);

    await waitFor(() => expect(api.createInvoice).toHaveBeenCalledTimes(1));
    expect(api.createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: client.id,
        currency: "IDR",
        items: [
          expect.objectContaining({
            description: "Browser workflow service",
            quantity: "1",
            unitPrice: "250000"
          })
        ]
      })
    );
  });
});
