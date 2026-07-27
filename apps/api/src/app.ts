import express, { type Request, type Response } from "express";

export interface AppDependencies {
  healthCheck: () => Promise<void>;
}

export function createApp({ healthCheck }: AppDependencies) {
  const app = express();

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

  return app;
}
