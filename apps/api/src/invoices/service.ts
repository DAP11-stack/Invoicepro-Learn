import { calculateInvoiceTotals } from "./calculations.js";
import type {
  CreateInvoiceInput,
  Invoice,
  InvoiceDetail,
  InvoiceListFilters,
  InvoicePage,
  InvoiceRepository,
  InvoiceService
} from "./types.js";

export class InvoiceApplicationService implements InvoiceService {
  constructor(private readonly repository: InvoiceRepository) {}

  async create(input: CreateInvoiceInput): Promise<Invoice> {
    const totals = calculateInvoiceTotals(input.items, input.taxRate);
    return this.repository.create({ ...input, ...totals });
  }

  async list(filters: InvoiceListFilters): Promise<InvoicePage> {
    return this.repository.list(filters);
  }

  async findById(id: string): Promise<InvoiceDetail | null> {
    return this.repository.findById(id);
  }
}
