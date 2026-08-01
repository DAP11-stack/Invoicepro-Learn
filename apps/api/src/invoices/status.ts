import { InvalidInvoiceStatusTransitionError, InvoiceNotOverdueError } from "./errors.js";
import type { InvoiceStatus, InvoiceTransitionTarget } from "./types.js";

const allowedTransitions: Record<InvoiceStatus, readonly InvoiceTransitionTarget[]> = {
  DRAFT: ["SENT"],
  SENT: ["OVERDUE", "PAID"],
  OVERDUE: ["PAID"],
  PAID: []
};

export function assertInvoiceStatusTransition(
  currentStatus: InvoiceStatus,
  targetStatus: InvoiceTransitionTarget
): void {
  if (!allowedTransitions[currentStatus].includes(targetStatus)) {
    throw new InvalidInvoiceStatusTransitionError(currentStatus, targetStatus);
  }
}

export function assertInvoicePastDue(dueDate: string, currentDate: string): void {
  if (dueDate >= currentDate) throw new InvoiceNotOverdueError();
}
