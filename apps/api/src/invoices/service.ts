import { calculateInvoiceTotals } from "./calculations.js";
import { InvoiceDomainValidationError } from "./errors.js";
import { createInvoiceSchema } from "./schemas.js";
import type {
  CreateInvoiceInput,
  Invoice,
  InvoiceDetail,
  InvoiceListFilters,
  InvoicePage,
  InvoiceRepository,
  InvoiceService,
  UpdateInvoiceInput
} from "./types.js";

export class InvoiceApplicationService implements InvoiceService {
  constructor(private readonly repository: InvoiceRepository) {}

  async create(input: CreateInvoiceInput): Promise<Invoice> {
    const totals = calculateInvoiceTotals(input.items, input.taxRate);
    return this.repository.create({ ...input, ...totals });
  }

  async update(id: string, input: UpdateInvoiceInput): Promise<Invoice | null> {
    return this.repository.updateDraft(id, (current) => {
      const merged = createInvoiceSchema.safeParse({
        clientId: input.clientId ?? current.clientId,
        issueDate: input.issueDate ?? current.issueDate,
        dueDate: input.dueDate ?? current.dueDate,
        currency: input.currency ?? current.currency,
        taxRate: input.taxRate ?? current.taxRate,
        notes: input.notes !== undefined ? input.notes : current.notes,
        items:
          input.items ??
          current.items.map(({ description, quantity, unitPrice }) => ({
            description,
            quantity,
            unitPrice
          }))
      });

      if (!merged.success) {
        throw new InvoiceDomainValidationError(
          merged.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message
          }))
        );
      }

      const totals = calculateInvoiceTotals(merged.data.items, merged.data.taxRate);
      return { ...merged.data, ...totals };
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.repository.deleteDraft(id);
  }

  async list(filters: InvoiceListFilters): Promise<InvoicePage> {
    return this.repository.list(filters);
  }

  async findById(id: string): Promise<InvoiceDetail | null> {
    return this.repository.findById(id);
  }
}
