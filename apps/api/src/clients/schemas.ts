import { z } from "zod";

const nullableShortText = z.string().trim().min(1).max(255).nullable().optional();

export const clientIdSchema = z.string().uuid();

export const createClientSchema = z.object({
  businessName: z.string().trim().min(1).max(255),
  contactName: nullableShortText,
  email: z.string().trim().email().max(320),
  phone: nullableShortText,
  billingAddress: z.string().trim().min(1).max(2_000),
  taxId: nullableShortText
});

export const updateClientSchema = createClientSchema.partial().refine(
  (input) => Object.keys(input).length > 0,
  "Provide at least one field to update."
);

export const clientListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0)
});
