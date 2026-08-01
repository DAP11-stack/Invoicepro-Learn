import { config } from "dotenv";
import { z } from "zod";

const environmentSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  INVOICE_ISSUER_NAME: z.string().trim().min(1).max(200).default("InvoicePro Demo"),
  INVOICE_ISSUER_EMAIL: z.string().trim().email().max(320).optional(),
  INVOICE_ISSUER_ADDRESS: z.string().trim().min(1).max(500).optional()
});

function loadEnvironment() {
  const runtimeFileEnvironment: Record<string, string> = {};
  config({ path: ".env", processEnv: runtimeFileEnvironment });

  return environmentSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL ?? runtimeFileEnvironment.DATABASE_URL,
    PORT: process.env.PORT ?? runtimeFileEnvironment.PORT,
    NODE_ENV: process.env.NODE_ENV ?? runtimeFileEnvironment.NODE_ENV,
    INVOICE_ISSUER_NAME:
      process.env.INVOICE_ISSUER_NAME ?? runtimeFileEnvironment.INVOICE_ISSUER_NAME,
    INVOICE_ISSUER_EMAIL:
      process.env.INVOICE_ISSUER_EMAIL ?? runtimeFileEnvironment.INVOICE_ISSUER_EMAIL,
    INVOICE_ISSUER_ADDRESS:
      process.env.INVOICE_ISSUER_ADDRESS ?? runtimeFileEnvironment.INVOICE_ISSUER_ADDRESS
  });
}

export const environment = loadEnvironment();
