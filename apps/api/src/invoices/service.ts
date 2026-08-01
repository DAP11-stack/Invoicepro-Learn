import { calculateInvoiceTotals } from "./calculations.js";
import { InvoiceDomainValidationError } from "./errors.js";
import { createInvoiceSchema } from "./schemas.js";
import { assertInvoicePastDue, assertInvoiceStatusTransition } from "./status.js";
import type {
  CreateInvoiceInput,
  Invoice,
  InvoiceDetail,
  InvoiceListFilters,
  InvoicePage,
  InvoiceRepository,
  InvoiceService,
  InvoiceTransitionTarget,
  UpdateInvoiceInput
} from "./types.js";

function toLocalIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export class InvoiceApplicationService implements InvoiceService {
  constructor(
    private readonly repository: InvoiceRepository,
    private readonly clock: () => Date = () => new Date()
  ) {}

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

  async send(id: string): Promise<Invoice | null> {
    return this.transition(id, "SENT");
  }

  async markOverdue(id: string): Promise<Invoice | null> {
    return this.transition(id, "OVERDUE");
  }

  async markPaid(id: string): Promise<Invoice | null> {
    return this.transition(id, "PAID");
  }

  async list(filters: InvoiceListFilters): Promise<InvoicePage> {
    return this.repository.list(filters);
  }

  async findById(id: string): Promise<InvoiceDetail | null> {
    return this.repository.findById(id);
  }

  private async transition(
    id: string,
    targetStatus: InvoiceTransitionTarget
  ): Promise<Invoice | null> {
    return this.repository.transitionStatus(id, (current) => {
      assertInvoiceStatusTransition(current.status, targetStatus);

      if (targetStatus === "OVERDUE") {
        assertInvoicePastDue(current.dueDate, toLocalIsoDate(this.clock()));
      }

      return targetStatus;
    });
  }
}
