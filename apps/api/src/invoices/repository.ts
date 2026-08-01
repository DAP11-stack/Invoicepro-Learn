import type { Pool } from "pg";

import { ClientNotFoundError } from "./errors.js";
import type { Invoice, InvoiceItem, InvoiceRepository, InvoiceStatus, PersistInvoiceInput } from "./types.js";

interface InvoiceRow {
  id: string;
  client_id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  status: InvoiceStatus;
  currency: string;
  tax_rate: string;
  subtotal: string;
  tax_total: string;
  grand_total: string;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

interface InvoiceItemRow {
  id: string;
  description: string;
  quantity: string;
  unit_price: string;
  line_total: string;
  position: number;
}

function toInvoiceItem(row: InvoiceItemRow): InvoiceItem {
  return {
    id: row.id,
    description: row.description,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    lineTotal: row.line_total,
    position: row.position
  };
}

function toInvoice(row: InvoiceRow, items: InvoiceItemRow[]): Invoice {
  return {
    id: row.id,
    clientId: row.client_id,
    invoiceNumber: row.invoice_number,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    status: row.status,
    currency: row.currency,
    taxRate: row.tax_rate,
    subtotal: row.subtotal,
    taxTotal: row.tax_total,
    grandTotal: row.grand_total,
    notes: row.notes,
    items: items.sort((left, right) => left.position - right.position).map(toInvoiceItem),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

const invoiceColumns = `
  id, client_id, invoice_number, issue_date, due_date, status, currency,
  tax_rate, subtotal, tax_total, grand_total, notes, created_at, updated_at
`;

export class PostgresInvoiceRepository implements InvoiceRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: PersistInvoiceInput): Promise<Invoice> {
    const connection = await this.pool.connect();

    try {
      await connection.query("BEGIN");

      const client = await connection.query("SELECT 1 FROM clients WHERE id = $1", [input.clientId]);
      if (client.rowCount !== 1) throw new ClientNotFoundError();

      const sequence = await connection.query<{ value: string }>(
        "SELECT nextval('invoice_number_sequence')::text AS value"
      );
      const sequenceValue = sequence.rows[0]!.value.padStart(6, "0");
      const period = input.issueDate.slice(0, 7).replace("-", "");
      const invoiceNumber = `INV-${period}-${sequenceValue}`;

      const invoiceResult = await connection.query<InvoiceRow>(
        `INSERT INTO invoices (
          client_id, invoice_number, issue_date, due_date, currency, tax_rate,
          subtotal, tax_total, grand_total, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING ${invoiceColumns}`,
        [
          input.clientId,
          invoiceNumber,
          input.issueDate,
          input.dueDate,
          input.currency,
          input.taxRate,
          input.subtotal,
          input.taxTotal,
          input.grandTotal,
          input.notes ?? null
        ]
      );
      const invoice = invoiceResult.rows[0]!;

      const values: Array<string | number> = [];
      const placeholders = input.items.map((item, index) => {
        const offset = index * 6;
        values.push(
          invoice.id,
          item.description,
          item.quantity,
          item.unitPrice,
          item.lineTotal,
          item.position
        );
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
      });
      const itemResult = await connection.query<InvoiceItemRow>(
        `INSERT INTO invoice_items (
          invoice_id, description, quantity, unit_price, line_total, position
        ) VALUES ${placeholders.join(", ")}
        RETURNING id, description, quantity, unit_price, line_total, position`,
        values
      );

      await connection.query("COMMIT");
      return toInvoice(invoice, itemResult.rows);
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }
  }
}
