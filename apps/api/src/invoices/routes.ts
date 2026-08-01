import type { NextFunction, Request, Response } from "express";

import { ClientNotFoundError, InvoiceCalculationError } from "./errors.js";
import { createInvoiceSchema } from "./schemas.js";
import type { InvoiceService } from "./types.js";

export function createInvoiceHandlers(invoiceService: InvoiceService) {
  return {
    create: async (request: Request, response: Response, next: NextFunction) => {
      const parsed = createInvoiceSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invoice input is invalid.",
            details: parsed.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message
            }))
          }
        });
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
