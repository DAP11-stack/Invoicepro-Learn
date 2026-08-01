import express, { type Request, type Response } from "express";

import { createClientHandlers } from "./clients/routes.js";
import type { ClientService } from "./clients/types.js";

export interface AppDependencies {
  healthCheck: () => Promise<void>;
  clientService: ClientService;
}

function isMalformedJsonError(error: unknown): boolean {
  return (
    error instanceof SyntaxError &&
    "status" in error &&
    error.status === 400 &&
    "type" in error &&
    error.type === "entity.parse.failed"
  );
}

export function createApp({ healthCheck, clientService }: AppDependencies) {
  const app = express();
  const clients = createClientHandlers(clientService);

  app.use(express.json());

  app.get("/api/v1/health", async (_request: Request, response: Response) => {
    try {
      await healthCheck();

      response.status(200).json({
        status: "ok",
        service: "invoicepro-api",
        database: "connected"
      });
    } catch {
      response.status(503).json({
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "Database is unavailable."
        }
      });
    }
  });

  app.get("/api/v1/clients", clients.list);
  app.post("/api/v1/clients", clients.create);
  app.get("/api/v1/clients/:id", clients.get);
  app.patch("/api/v1/clients/:id", clients.update);
  app.delete("/api/v1/clients/:id", clients.delete);

  app.use((_request: Request, response: Response) => {
    response.status(404).json({
      error: { code: "NOT_FOUND", message: "API route was not found." }
    });
  });

  app.use((error: unknown, _request: Request, response: Response, next: express.NextFunction) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    if (isMalformedJsonError(error)) {
      response.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request body contains invalid JSON.",
          details: []
        }
      });
      return;
    }

    response.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." }
    });
  });

  return app;
}
