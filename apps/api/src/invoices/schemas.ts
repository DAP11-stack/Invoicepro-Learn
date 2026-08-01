import { Decimal } from "decimal.js";
import { z } from "zod";

interface DecimalRules {
  label: string;
  maximum: string;
  maximumDecimalPlaces: number;
  positive?: boolean;
}

function decimalInput(rules: DecimalRules) {
  return z
    .union([z.string(), z.number().finite()])
    .transform((value) => String(value).trim())
    .superRefine((value, context) => {
      let decimal: Decimal;
      try {
        decimal = new Decimal(value);
      } catch {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `${rules.label} must be a decimal number.` });
        return;
      }

      if (!decimal.isFinite()) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `${rules.label} must be finite.` });
      }
      if (rules.positive ? decimal.lessThanOrEqualTo(0) : decimal.isNegative()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: rules.positive
            ? `${rules.label} must be greater than zero.`
            : `${rules.label} cannot be negative.`
        });
      }
      if (decimal.greaterThan(rules.maximum)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `${rules.label} is too large.` });
      }
      if (decimal.decimalPlaces() > rules.maximumDecimalPlaces) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${rules.label} supports at most ${rules.maximumDecimalPlaces} decimal places.`
        });
      }
    });
}

function isIsoDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const dateSchema = z
  .string()
  .regex(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  .refine(isIsoDate, "Date is invalid.");
const quantitySchema = decimalInput({
  label: "Quantity",
  maximum: "999999999.999",
  maximumDecimalPlaces: 3,
  positive: true
});
const unitPriceSchema = decimalInput({
  label: "Unit price",
  maximum: "9999999999999.99",
  maximumDecimalPlaces: 2
});
const taxRateSchema = decimalInput({
  label: "Tax rate",
  maximum: "100",
  maximumDecimalPlaces: 2
});
const currencySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, "Currency must contain exactly three letters.")
  .transform((value) => value.toUpperCase());
const notesSchema = z.string().trim().min(1).max(2_000).nullable().optional();

const invoiceItemSchema = z
  .object({
    description: z.string().trim().min(1).max(1_000),
    quantity: quantitySchema,
    unitPrice: unitPriceSchema
  })
  .strict();

export const invoiceIdSchema = z.string().uuid();
export const invoiceActionSchema = z.object({}).strict();

export const invoiceListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
    status: z.enum(["DRAFT", "SENT", "OVERDUE", "PAID"]).optional(),
    clientId: z.string().uuid().optional()
  })
  .strict();

export const createInvoiceSchema = z
  .object({
    clientId: z.string().uuid(),
    issueDate: dateSchema,
    dueDate: dateSchema,
    currency: currencySchema.default("IDR"),
    taxRate: taxRateSchema.default("0"),
    notes: notesSchema,
    items: z.array(invoiceItemSchema).min(1).max(100)
  })
  .strict()
  .superRefine((input, context) => {
    if (input.dueDate < input.issueDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dueDate"],
        message: "Due date cannot be before issue date."
      });
    }
  });

export const updateInvoiceSchema = z
  .object({
    clientId: z.string().uuid().optional(),
    issueDate: dateSchema.optional(),
    dueDate: dateSchema.optional(),
    currency: currencySchema.optional(),
    taxRate: taxRateSchema.optional(),
    notes: notesSchema,
    items: z.array(invoiceItemSchema).min(1).max(100).optional()
  })
  .strict()
  .superRefine((input, context) => {
    if (Object.keys(input).length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one invoice field must be provided."
      });
    }

    if (input.issueDate && input.dueDate && input.dueDate < input.issueDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dueDate"],
        message: "Due date cannot be before issue date."
      });
    }
  });
