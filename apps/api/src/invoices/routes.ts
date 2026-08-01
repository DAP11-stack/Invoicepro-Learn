import type { NextFunction, Request, Response } from "express";
import type { ZodError } from "zod";

import {
  ClientNotFoundError,
  InvalidInvoiceStatusTransitionError,
  InvoiceCalculationError,
  InvoiceDomainValidationError,
  InvoiceNotEditableError,
  InvoiceNotOverdueError
} from "./errors.js";
import {
  createInvoiceSchema,
  invoiceActionSchema,
  invoiceIdSchema,
  invoiceListQuerySchema,
  updateInvoiceSchema
} from "./schemas.js";
import type { InvoiceService } from "./types.js";

function validationError(response: Response, error: ZodError, message: string) {
  response.status(400).json({
    error: {
      code: "VALIDATION_ERROR",
      message,
      details: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    }
  });
}

function createStatusTransitionHandler(
  transition: (id: string) => ReturnType<InvoiceService["send"]>
) {
  return async (request: Request, response: Response, next: NextFunction) => {
    const id = invoiceIdSchema.safeParse(request.params.id);
    if (!id.success) {
      validationError(response, id.error, "Invoice id is invalid.");
      return;
    }

    const input = invoiceActionSchema.safeParse(request.body === undefined ? {} : request.body);
    if (!input.success) {
      validationError(response, input.error, "Invoice action input is invalid.");
      return;
    }

    try {
      const invoice = await transition(id.data);
      if (invoice == null) {
        response.status(404).json({
          error: { code: "NOT_FOUND", message: "Invoice was not found." }
        });
        return;
      }

      response.status(200).json({ data: invoice });
    } catch (error) {
      if (error instanceof InvalidInvoiceStatusTransitionError) {
        response.status(409).json({
          error: { code: "INVALID_STATUS_TRANSITION", message: error.message }
        });
        return;
      }
      if (error instanceof InvoiceNotOverdueError) {
        response.status(409).json({
          error: { code: "INVOICE_NOT_OVERDUE", message: error.message }
        });
        return;
      }

      next(error);
    }
  };
}

export function createInvoiceHandlers(invoiceService: InvoiceService) {
  return {
    send: createStatusTransitionHandler((id) => invoiceService.send(id)),
    markOverdue: createStatusTransitionHandler((id) => invoiceService.markOverdue(id)),
    markPaid: createStatusTransitionHandler((id) => invoiceService.markPaid(id)),
    list: async (request: Request, response: Response, next: NextFunction) => {
      const parsed = invoiceListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        validationError(response, parsed.error, "Invoice query is invalid.");
        return;
      }

      try {
        response.status(200).json(await invoiceService.list(parsed.data));
      } catch (error) {
        next(error);
      }
    },
    get: async (request: Request, response: Response, next: NextFunction) => {
      const parsed = invoiceIdSchema.safeParse(request.params.id);
      if (!parsed.success) {
        validationError(response, parsed.error, "Invoice id is invalid.");
        return;
      }

      try {
        const invoice = await invoiceService.findById(parsed.data);
        if (invoice == null) {
          response.status(404).json({
            error: { code: "NOT_FOUND", message: "Invoice was not found." }
          });
          return;
        }

        response.status(200).json({ data: invoice });
      } catch (error) {
        next(error);
      }
    },
    create: async (request: Request, response: Response, next: NextFunction) => {
      const parsed = createInvoiceSchema.safeParse(request.body);
      if (!parsed.success) {
        validationError(response, parsed.error, "Invoice input is invalid.");
        return;
      }

      try {
        response.status(201).json({ data: await invoiceService.create(parsed.data) });
      } catch (error) {
        if (error instanceof ClientNotFoundError) {
          response.status(404).json({
            error: { code: "NOT_FOUND", message: error.message }
          });
          return;
        }
        if (error instanceof InvoiceCalculationError) {
          response.status(400).json({
            error: {
              code: "VALIDATION_ERROR",
              message: "Invoice input is invalid.",
              details: [{ path: "items", message: error.message }]
            }
          });
          return;
        }

        next(error);
      }
    },
    update: async (request: Request, response: Response, next: NextFunction) => {
      const id = invoiceIdSchema.safeParse(request.params.id);
      if (!id.success) {
        validationError(response, id.error, "Invoice id is invalid.");
        return;
      }

      const input = updateInvoiceSchema.safeParse(request.body);
      if (!input.success) {
        validationError(response, input.error, "Invoice input is invalid.");
        return;
      }

      try {
        const invoice = await invoiceService.update(id.data, input.data);
        if (invoice == null) {
          response.status(404).json({
            error: { code: "NOT_FOUND", message: "Invoice was not found." }
          });
          return;
        }

        response.status(200).json({ data: invoice });
      } catch (error) {
        if (error instanceof ClientNotFoundError) {
          response.status(404).json({
            error: { code: "NOT_FOUND", message: error.message }
          });
          return;
        }
        if (error instanceof InvoiceNotEditableError) {
          response.status(409).json({
            error: { code: "INVOICE_NOT_EDITABLE", message: error.message }
          });
          return;
        }
        if (error instanceof InvoiceDomainValidationError) {
          response.status(400).json({
            error: {
              code: "VALIDATION_ERROR",
              message: "Invoice input is invalid.",
              details: error.details
            }
          });
          return;
        }
        if (error instanceof InvoiceCalculationError) {
          response.status(400).json({
            error: {
              code: "VALIDATION_ERROR",
              message: "Invoice input is invalid.",
              details: [{ path: "items", message: error.message }]
            }
          });
          return;
        }

        next(error);
      }
    },
    delete: async (request: Request, response: Response, next: NextFunction) => {
      const id = invoiceIdSchema.safeParse(request.params.id);
      if (!id.success) {
        validationError(response, id.error, "Invoice id is invalid.");
        return;
      }

      try {
        const deleted = await invoiceService.delete(id.data);
        if (!deleted) {
          response.status(404).json({
            error: { code: "NOT_FOUND", message: "Invoice was not found." }
          });
          return;
        }

        response.status(204).send();
      } catch (error) {
        if (error instanceof InvoiceNotEditableError) {
          response.status(409).json({
            error: { code: "INVOICE_NOT_EDITABLE", message: error.message }
          });
          return;
        }

        next(error);
      }
    }
  };
}
