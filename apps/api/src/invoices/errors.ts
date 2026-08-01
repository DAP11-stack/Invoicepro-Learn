export class ClientNotFoundError extends Error {
  constructor() {
    super("Client was not found.");
    this.name = "ClientNotFoundError";
  }
}

export class InvoiceCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoiceCalculationError";
  }
}

export interface InvoiceValidationDetail {
  path: string;
  message: string;
}

export class InvoiceDomainValidationError extends Error {
  constructor(public readonly details: InvoiceValidationDetail[]) {
    super("Invoice data is invalid.");
    this.name = "InvoiceDomainValidationError";
  }
}

export class InvoiceNotEditableError extends Error {
  constructor() {
    super("Only draft invoices can be modified.");
    this.name = "InvoiceNotEditableError";
  }
}

export class InvalidInvoiceStatusTransitionError extends Error {
  constructor(currentStatus: string, targetStatus: string) {
    super(`Invoice status cannot transition from ${currentStatus} to ${targetStatus}.`);
    this.name = "InvalidInvoiceStatusTransitionError";
  }
}

export class InvoiceNotOverdueError extends Error {
  constructor() {
    super("Invoice cannot be marked overdue until after its due date.");
    this.name = "InvoiceNotOverdueError";
  }
}
