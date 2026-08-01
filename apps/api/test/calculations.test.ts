import { describe, expect, it } from "vitest";

import { calculateInvoiceTotals } from "../src/invoices/calculations.js";
import { InvoiceCalculationError } from "../src/invoices/errors.js";

describe("invoice calculations", () => {
  it("calculates the documented multi-item and tax example", () => {
    const result = calculateInvoiceTotals(
      [
        { description: "Item A", quantity: "2", unitPrice: "100000.00" },
        { description: "Item B", quantity: "1", unitPrice: "50000.00" }
      ],
      "11"
    );

    expect(result).toEqual({
      subtotal: "250000.00",
      taxTotal: "27500.00",
      grandTotal: "277500.00",
      items: [
        {
          description: "Item A",
          quantity: "2.000",
          unitPrice: "100000.00",
          lineTotal: "200000.00",
          position: 1
        },
        {
          description: "Item B",
          quantity: "1.000",
          unitPrice: "50000.00",
          lineTotal: "50000.00",
          position: 2
        }
      ]
    });
  });

  it("uses half-up rounding at line and tax boundaries", () => {
    const result = calculateInvoiceTotals(
      [{ description: "Rounded item", quantity: "1.005", unitPrice: "1.00" }],
      "50"
    );

    expect(result.items[0]?.lineTotal).toBe("1.01");
    expect(result.subtotal).toBe("1.01");
    expect(result.taxTotal).toBe("0.51");
    expect(result.grandTotal).toBe("1.52");
  });

  it("supports zero tax without floating-point drift", () => {
    const result = calculateInvoiceTotals(
      [
        { description: "First", quantity: "0.1", unitPrice: "10.10" },
        { description: "Second", quantity: "0.2", unitPrice: "10.10" }
      ],
      "0"
    );

    expect(result.subtotal).toBe("3.03");
    expect(result.taxTotal).toBe("0.00");
    expect(result.grandTotal).toBe("3.03");
  });

  it("rejects negative values and totals outside the database range", () => {
    expect(() => calculateInvoiceTotals([], "0")).toThrow(
      "Invoice must contain between 1 and 100 items."
    );
    expect(() =>
      calculateInvoiceTotals([{ description: "Invalid", quantity: "-1", unitPrice: "10" }], "0")
    ).toThrow(InvoiceCalculationError);
    expect(() =>
      calculateInvoiceTotals(
        [{ description: "Overflow", quantity: "2", unitPrice: "9999999999999.99" }],
        "0"
      )
    ).toThrow("Calculated money exceeds the supported range.");
  });
});
