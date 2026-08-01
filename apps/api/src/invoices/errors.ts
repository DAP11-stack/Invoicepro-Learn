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
