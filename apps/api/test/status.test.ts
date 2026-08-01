import { describe, expect, it } from "vitest";

import {
  InvalidInvoiceStatusTransitionError,
  InvoiceNotOverdueError
} from "../src/invoices/errors.js";
import {
  assertInvoicePastDue,
  assertInvoiceStatusTransition
} from "../src/invoices/status.js";
import type { InvoiceStatus, InvoiceTransitionTarget } from "../src/invoices/types.js";

describe("invoice status transitions", () => {
  it.each([
    ["DRAFT", "SENT"],
    ["SENT", "OVERDUE"],
    ["SENT", "PAID"],
    ["OVERDUE", "PAID"]
  ] as const)("allows %s to transition to %s", (current, target) => {
    expect(() => assertInvoiceStatusTransition(current, target)).not.toThrow();
  });

  it.each([
    ["DRAFT", "OVERDUE"],
    ["DRAFT", "PAID"],
    ["SENT", "SENT"],
    ["OVERDUE", "SENT"],
    ["OVERDUE", "OVERDUE"],
    ["PAID", "SENT"],
    ["PAID", "OVERDUE"],
    ["PAID", "PAID"]
  ] as Array<[InvoiceStatus, InvoiceTransitionTarget]>)(
    "rejects %s to %s",
    (current, target) => {
      expect(() => assertInvoiceStatusTransition(current, target)).toThrow(
        InvalidInvoiceStatusTransitionError
      );
    }
  );

  it("allows overdue only after the due date", () => {
    expect(() => assertInvoicePastDue("2026-07-31", "2026-08-01")).not.toThrow();
    expect(() => assertInvoicePastDue("2026-08-01", "2026-08-01")).toThrow(
      InvoiceNotOverdueError
    );
    expect(() => assertInvoicePastDue("2026-08-02", "2026-08-01")).toThrow(
      InvoiceNotOverdueError
    );
  });
});
