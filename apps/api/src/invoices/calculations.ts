import { Decimal } from "decimal.js";

import { InvoiceCalculationError } from "./errors.js";
import type { CreateInvoiceItemInput, InvoiceTotals } from "./types.js";

const maximumMoney = new Decimal("9999999999999.99");
const roundingMode = Decimal.ROUND_HALF_UP;

function money(value: Decimal): string {
  const rounded = value.toDecimalPlaces(2, roundingMode);
  if (rounded.isNegative() || rounded.greaterThan(maximumMoney)) {
    throw new InvoiceCalculationError("Calculated money exceeds the supported range.");
  }

  return rounded.toFixed(2);
}

export function calculateInvoiceTotals(
  items: CreateInvoiceItemInput[],
  taxRate: string
): InvoiceTotals {
  if (items.length < 1 || items.length > 100) {
    throw new InvoiceCalculationError("Invoice must contain between 1 and 100 items.");
  }

  const rate = new Decimal(taxRate);
  if (!rate.isFinite() || rate.isNegative() || rate.greaterThan(100)) {
    throw new InvoiceCalculationError("Tax rate must be between 0 and 100.");
  }

  let subtotal = new Decimal(0);
  const calculatedItems = items.map((item, index) => {
    const quantity = new Decimal(item.quantity);
    const unitPrice = new Decimal(item.unitPrice);

    if (!quantity.isFinite() || quantity.lessThanOrEqualTo(0)) {
      throw new InvoiceCalculationError("Item quantity must be greater than zero.");
    }
    if (!unitPrice.isFinite() || unitPrice.isNegative()) {
      throw new InvoiceCalculationError("Item unit price cannot be negative.");
    }

    const lineTotal = money(quantity.times(unitPrice));
    subtotal = subtotal.plus(lineTotal);

    return {
      ...item,
      quantity: quantity.toFixed(3),
      unitPrice: unitPrice.toFixed(2),
      lineTotal,
      position: index + 1
    };
  });

  const subtotalValue = new Decimal(money(subtotal));
  const taxTotalValue = new Decimal(money(subtotalValue.times(rate).dividedBy(100)));
  const grandTotalValue = subtotalValue.plus(taxTotalValue);

  return {
    subtotal: money(subtotalValue),
    taxTotal: money(taxTotalValue),
    grandTotal: money(grandTotalValue),
    items: calculatedItems
  };
}
