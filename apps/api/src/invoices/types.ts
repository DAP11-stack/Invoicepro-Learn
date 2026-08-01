export type InvoiceStatus = "DRAFT" | "SENT" | "OVERDUE" | "PAID";

export interface CreateInvoiceItemInput {
  description: string;
  quantity: string;
  unitPrice: string;
}

export interface CreateInvoiceInput {
  clientId: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  taxRate: string;
  notes?: string | null;
  items: CreateInvoiceItemInput[];
}

export interface CalculatedInvoiceItem extends CreateInvoiceItemInput {
  lineTotal: string;
  position: number;
}

export interface InvoiceTotals {
  subtotal: string;
  taxTotal: string;
  grandTotal: string;
  items: CalculatedInvoiceItem[];
}

export interface PersistInvoiceInput extends Omit<CreateInvoiceInput, "items">, InvoiceTotals {}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  position: number;
}

export interface Invoice {
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
  items: InvoiceItem[];
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceRepository {
  create(input: PersistInvoiceInput): Promise<Invoice>;
}

export interface InvoiceService {
  create(input: CreateInvoiceInput): Promise<Invoice>;
}
