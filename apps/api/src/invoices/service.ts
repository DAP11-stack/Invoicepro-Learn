import { calculateInvoiceTotals } from "./calculations.js";
import type { CreateInvoiceInput, Invoice, InvoiceRepository, InvoiceService } from "./types.js";

export class InvoiceApplicationService implements InvoiceService {
  constructor(private readonly repository: InvoiceRepository) {}

  async create(input: CreateInvoiceInput): Promise<Invoice> {
    const totals = calculateInvoiceTotals(input.items, input.taxRate);
    return this.repository.create({ ...input, ...totals });
  }
}
