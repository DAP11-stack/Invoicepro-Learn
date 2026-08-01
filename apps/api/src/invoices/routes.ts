import type { NextFunction, Request, Response } from "express";
import type { ZodError } from "zod";

import { ClientNotFoundError, InvoiceCalculationError } from "./errors.js";
import { createInvoiceSchema, invoiceIdSchema, invoiceListQuerySchema } from "./schemas.js";
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

export function createInvoiceHandlers(invoiceService: InvoiceService) {
  return {
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
    }
  };
}
