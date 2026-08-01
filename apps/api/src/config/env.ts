import { config } from "dotenv";
import { z } from "zod";

const environmentSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development")
});

function loadEnvironment() {
  const runtimeFileEnvironment: Record<string, string> = {};
  config({ path: ".env", processEnv: runtimeFileEnvironment });

  return environmentSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL ?? runtimeFileEnvironment.DATABASE_URL,
    PORT: process.env.PORT ?? runtimeFileEnvironment.PORT,
    NODE_ENV: process.env.NODE_ENV ?? runtimeFileEnvironment.NODE_ENV
  });
}

export const environment = loadEnvironment();
