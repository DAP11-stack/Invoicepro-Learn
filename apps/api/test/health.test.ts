import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";

describe("GET /api/v1/health", () => {
  it("returns service and database health", async () => {
    const app = createApp({ healthCheck: async () => undefined });

    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      service: "invoicepro-api",
      database: "connected"
    });
  });

  it("returns a safe error when database health check fails", async () => {
    const app = createApp({
      healthCheck: async () => Promise.reject(new Error("connection failed"))
    });

    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: {
        code: "DATABASE_UNAVAILABLE",
        message: "Database is unavailable."
      }
    });
  });
});
