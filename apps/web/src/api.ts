import type {
  ApiErrorBody,
  Client,
  ClientInput,
  InvoiceDetail,
  InvoiceInput,
  InvoiceListItem,
  InvoiceRecord,
  InvoiceStatus,
  Page
} from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code = "REQUEST_FAILED",
    public readonly details: Array<{ path: string; message: string }> = []
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody = {};
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    // A non-JSON upstream error still becomes a safe client-side message.
  }

  return new ApiError(
    body.error?.message ?? "The request could not be completed.",
    response.status,
    body.error?.code,
    body.error?.details
  );
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body == null ? {} : { "Content-Type": "application/json" }),
      ...options.headers
    }
  });

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  listClients: async (): Promise<Page<Client>> => request("/api/v1/clients?limit=100&offset=0"),
  createClient: async (input: ClientInput): Promise<Client> =>
    (await request<{ data: Client }>("/api/v1/clients", {
      method: "POST",
      body: JSON.stringify(input)
    })).data,
  updateClient: async (id: string, input: ClientInput): Promise<Client> =>
    (await request<{ data: Client }>(`/api/v1/clients/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    })).data,
  deleteClient: async (id: string): Promise<void> =>
    request(`/api/v1/clients/${id}`, { method: "DELETE" }),
  listInvoices: async (filters: {
    status?: InvoiceStatus;
    clientId?: string;
  } = {}): Promise<Page<InvoiceListItem>> => {
    const query = new URLSearchParams({ limit: "100", offset: "0" });
    if (filters.status) query.set("status", filters.status);
    if (filters.clientId) query.set("clientId", filters.clientId);
    return request(`/api/v1/invoices?${query}`);
  },
  getInvoice: async (id: string): Promise<InvoiceDetail> =>
    (await request<{ data: InvoiceDetail }>(`/api/v1/invoices/${id}`)).data,
  createInvoice: async (input: InvoiceInput): Promise<InvoiceRecord> =>
    (await request<{ data: InvoiceRecord }>("/api/v1/invoices", {
      method: "POST",
      body: JSON.stringify(input)
    })).data,
  updateInvoice: async (id: string, input: InvoiceInput): Promise<InvoiceRecord> =>
    (await request<{ data: InvoiceRecord }>(`/api/v1/invoices/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    })).data,
  deleteInvoice: async (id: string): Promise<void> =>
    request(`/api/v1/invoices/${id}`, { method: "DELETE" }),
  sendInvoice: async (id: string): Promise<InvoiceDetail> =>
    (await request<{ data: InvoiceDetail }>(`/api/v1/invoices/${id}/send`, {
      method: "POST"
    })).data,
  markInvoiceOverdue: async (id: string): Promise<InvoiceDetail> =>
    (await request<{ data: InvoiceDetail }>(`/api/v1/invoices/${id}/mark-overdue`, {
      method: "POST"
    })).data,
  markInvoicePaid: async (id: string): Promise<InvoiceDetail> =>
    (await request<{ data: InvoiceDetail }>(`/api/v1/invoices/${id}/mark-paid`, {
      method: "POST"
    })).data,
  downloadInvoicePdf: async (id: string): Promise<{ blob: Blob; fileName: string }> => {
    const response = await fetch(`/api/v1/invoices/${id}/pdf`);
    if (!response.ok) throw await parseError(response);
    const disposition = response.headers.get("Content-Disposition") ?? "";
    const fileName = disposition.match(/filename="([^"]+)"/)?.[1] ?? `invoice-${id}.pdf`;
    return { blob: await response.blob(), fileName };
  }
};
