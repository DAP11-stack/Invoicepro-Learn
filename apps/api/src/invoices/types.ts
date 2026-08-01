export type InvoiceStatus = "DRAFT" | "SENT" | "OVERDUE" | "PAID";
export type InvoiceTransitionTarget = Exclude<InvoiceStatus, "DRAFT">;

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

export interface UpdateInvoiceInput {
  clientId?: string;
  issueDate?: string;
  dueDate?: string;
  currency?: string;
  taxRate?: string;
  notes?: string | null;
  items?: CreateInvoiceItemInput[];
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

export interface InvoiceClientSummary {
  id: string;
  businessName: string;
  email: string;
}

export interface InvoiceClient extends InvoiceClientSummary {
  contactName: string | null;
  phone: string | null;
  billingAddress: string;
  taxId: string | null;
}

export interface InvoiceListItem extends Omit<Invoice, "items"> {
  client: InvoiceClientSummary;
}

export interface InvoiceDetail extends Invoice {
  client: InvoiceClient;
}

export interface InvoiceListFilters {
  limit: number;
  offset: number;
  status?: InvoiceStatus;
  clientId?: string;
}

export interface InvoicePage {
  data: InvoiceListItem[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

export interface InvoiceTransitionContext {
  status: InvoiceStatus;
  dueDate: string;
}

export interface InvoiceRepository {
  create(input: PersistInvoiceInput): Promise<Invoice>;
  updateDraft(
    id: string,
    prepare: (current: Invoice) => PersistInvoiceInput
  ): Promise<Invoice | null>;
  deleteDraft(id: string): Promise<boolean>;
  transitionStatus(
    id: string,
    resolveTarget: (current: InvoiceTransitionContext) => InvoiceTransitionTarget
  ): Promise<Invoice | null>;
  list(filters: InvoiceListFilters): Promise<InvoicePage>;
  findById(id: string): Promise<InvoiceDetail | null>;
}

export interface InvoiceService {
  create(input: CreateInvoiceInput): Promise<Invoice>;
  update(id: string, input: UpdateInvoiceInput): Promise<Invoice | null>;
  delete(id: string): Promise<boolean>;
  send(id: string): Promise<Invoice | null>;
  markOverdue(id: string): Promise<Invoice | null>;
  markPaid(id: string): Promise<Invoice | null>;
  list(filters: InvoiceListFilters): Promise<InvoicePage>;
  findById(id: string): Promise<InvoiceDetail | null>;
}
