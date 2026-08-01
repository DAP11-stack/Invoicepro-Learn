import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

import {
  clientIdSchema,
  clientListQuerySchema,
  createClientSchema,
  updateClientSchema
} from "./schemas.js";
import type { ClientService } from "./types.js";

function validationError(response: Response, error: ZodError) {
  return response.status(400).json({
    error: {
      code: "VALIDATION_ERROR",
      message: "Client input is invalid.",
      details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
    }
  });
}

function parseOrRespond<T>(
  schema: { safeParse: (input: unknown) => { success: true; data: T } | { success: false; error: ZodError } },
  input: unknown,
  response: Response
): T | null {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;

  validationError(response, parsed.error);
  return null;
}

function isClientInUseError(error: unknown): boolean {
  if (typeof error !== "object" || error == null || !("code" in error)) return false;

  return error.code === "23001" || error.code === "23503";
}

export function createClientHandlers(clientService: ClientService) {
  return {
    list: async (request: Request, response: Response, next: NextFunction) => {
      const query = parseOrRespond(clientListQuerySchema, request.query, response);
      if (query == null) return;

      try {
        response.status(200).json(await clientService.list(query.limit, query.offset));
      } catch (error) {
        next(error);
      }
    },
    create: async (request: Request, response: Response, next: NextFunction) => {
      const input = parseOrRespond(createClientSchema, request.body, response);
      if (input == null) return;

      try {
        response.status(201).json({ data: await clientService.create(input) });
      } catch (error) {
        next(error);
      }
    },
    get: async (request: Request, response: Response, next: NextFunction) => {
      const id = parseOrRespond(clientIdSchema, request.params.id, response);
      if (id == null) return;

      try {
        const client = await clientService.findById(id);
        if (client == null) {
          response.status(404).json({ error: { code: "NOT_FOUND", message: "Client was not found." } });
          return;
        }

        response.status(200).json({ data: client });
      } catch (error) {
        next(error);
      }
    },
    update: async (request: Request, response: Response, next: NextFunction) => {
      const id = parseOrRespond(clientIdSchema, request.params.id, response);
      if (id == null) return;

      const input = parseOrRespond(updateClientSchema, request.body, response);
      if (input == null) return;

      try {
        const client = await clientService.update(id, input);
        if (client == null) {
          response.status(404).json({ error: { code: "NOT_FOUND", message: "Client was not found." } });
          return;
        }

        response.status(200).json({ data: client });
      } catch (error) {
        next(error);
      }
    },
    delete: async (request: Request, response: Response, next: NextFunction) => {
      const id = parseOrRespond(clientIdSchema, request.params.id, response);
      if (id == null) return;

      try {
        const deleted = await clientService.delete(id);
        if (!deleted) {
          response.status(404).json({ error: { code: "NOT_FOUND", message: "Client was not found." } });
          return;
        }

        response.status(204).send();
      } catch (error) {
        if (isClientInUseError(error)) {
          response.status(409).json({
            error: { code: "CLIENT_IN_USE", message: "Client is referenced by an invoice." }
          });
          return;
        }

        next(error);
      }
    }
  };
}
