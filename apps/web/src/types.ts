export type InvoiceStatus = "DRAFT" | "SENT" | "OVERDUE" | "PAID";

export interface Client {
  id: string;
  businessName: string;
  contactName: string | null;
  email: string;
  phone: string | null;
  billingAddress: string;
  taxId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientInput {
  businessName: string;
  contactName?: string | null;
  email: string;
  phone?: string | null;
  billingAddress: string;
  taxId?: string | null;
}

export interface InvoiceItemInput {
  description: string;
  quantity: string;
  unitPrice: string;
}

export interface InvoiceInput {
  clientId: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  taxRate: string;
  notes?: string | null;
  items: InvoiceItemInput[];
}

export interface InvoiceItem extends InvoiceItemInput {
  id: string;
  lineTotal: string;
  position: number;
}

export interface InvoiceBase {
  id: string;
  clientId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  currency: string;
  taxRate: string;
  subtotal: string;
  taxTotal: string;
  grandTotal: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceListItem extends InvoiceBase {
  client: Pick<Client, "id" | "businessName" | "email">;
}

export interface InvoiceRecord extends InvoiceBase {
  items: InvoiceItem[];
}

export interface InvoiceDetail extends InvoiceRecord {
  client: Client;
}

export interface Page<T> {
  data: T[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: Array<{ path: string; message: string }>;
  };
}
