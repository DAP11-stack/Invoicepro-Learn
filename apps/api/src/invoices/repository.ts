import type { Pool, PoolClient } from "pg";

import { ClientNotFoundError, InvoiceNotEditableError } from "./errors.js";
import type {
  Invoice,
  InvoiceDetail,
  InvoiceItem,
  InvoiceListFilters,
  InvoiceListItem,
  InvoicePage,
  InvoiceRepository,
  InvoiceStatus,
  PersistInvoiceInput
} from "./types.js";

interface InvoiceRow {
  id: string;
  client_id: string;
  invoice_number: string;
  issue_date: string | Date;
  due_date: string | Date;
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

interface InvoiceListRow extends InvoiceRow {
  client_business_name: string;
  client_email: string;
}

interface InvoiceDetailRow extends InvoiceListRow {
  client_contact_name: string | null;
  client_phone: string | null;
  client_billing_address: string;
  client_tax_id: string | null;
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

function toIsoDate(value: string | Date): string {
  if (typeof value === "string") return value;

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toInvoiceBase(row: InvoiceRow): Omit<Invoice, "items"> {
  return {
    id: row.id,
    clientId: row.client_id,
    invoiceNumber: row.invoice_number,
    issueDate: toIsoDate(row.issue_date),
    dueDate: toIsoDate(row.due_date),
    status: row.status,
    currency: row.currency,
    taxRate: row.tax_rate,
    subtotal: row.subtotal,
    taxTotal: row.tax_total,
    grandTotal: row.grand_total,
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function toInvoice(row: InvoiceRow, items: InvoiceItemRow[]): Invoice {
  return {
    ...toInvoiceBase(row),
    items: items.sort((left, right) => left.position - right.position).map(toInvoiceItem)
  };
}

function toInvoiceListItem(row: InvoiceListRow): InvoiceListItem {
  return {
    ...toInvoiceBase(row),
    client: {
      id: row.client_id,
      businessName: row.client_business_name,
      email: row.client_email
    }
  };
}

function toInvoiceDetail(row: InvoiceDetailRow, items: InvoiceItemRow[]): InvoiceDetail {
  return {
    ...toInvoice(row, items),
    client: {
      id: row.client_id,
      businessName: row.client_business_name,
      contactName: row.client_contact_name,
      email: row.client_email,
      phone: row.client_phone,
      billingAddress: row.client_billing_address,
      taxId: row.client_tax_id
    }
  };
}

const invoiceColumns = `
  id, client_id, invoice_number, issue_date, due_date, status, currency,
  tax_rate, subtotal, tax_total, grand_total, notes, created_at, updated_at
`;

const selectedInvoiceColumns = `
  i.id, i.client_id, i.invoice_number, i.issue_date, i.due_date, i.status,
  i.currency, i.tax_rate, i.subtotal, i.tax_total, i.grand_total, i.notes,
  i.created_at, i.updated_at
`;

async function insertInvoiceItems(
  connection: PoolClient,
  invoiceId: string,
  items: PersistInvoiceInput["items"]
): Promise<InvoiceItemRow[]> {
  const values: Array<string | number> = [];
  const placeholders = items.map((item, index) => {
    const offset = index * 6;
    values.push(
      invoiceId,
      item.description,
      item.quantity,
      item.unitPrice,
      item.lineTotal,
      item.position
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
  });

  const result = await connection.query<InvoiceItemRow>(
    `INSERT INTO invoice_items (
      invoice_id, description, quantity, unit_price, line_total, position
    ) VALUES ${placeholders.join(", ")}
    RETURNING id, description, quantity, unit_price, line_total, position`,
    values
  );
  return result.rows;
}

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

      const items = await insertInvoiceItems(connection, invoice.id, input.items);

      await connection.query("COMMIT");
      return toInvoice(invoice, items);
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }
  }

  async updateDraft(
    id: string,
    prepare: (current: Invoice) => PersistInvoiceInput
  ): Promise<Invoice | null> {
    const connection = await this.pool.connect();

    try {
      await connection.query("BEGIN");
      const invoiceResult = await connection.query<InvoiceRow>(
        `SELECT ${invoiceColumns}
         FROM invoices
         WHERE id = $1
         FOR UPDATE`,
        [id]
      );
      const invoice = invoiceResult.rows[0];
      if (invoice == null) {
        await connection.query("COMMIT");
        return null;
      }

      if (invoice.status !== "DRAFT") throw new InvoiceNotEditableError();

      const currentItems = await connection.query<InvoiceItemRow>(
        `SELECT id, description, quantity, unit_price, line_total, position
         FROM invoice_items
         WHERE invoice_id = $1
         ORDER BY position`,
        [id]
      );
      const input = prepare(toInvoice(invoice, currentItems.rows));

      const client = await connection.query("SELECT 1 FROM clients WHERE id = $1", [input.clientId]);
      if (client.rowCount !== 1) throw new ClientNotFoundError();

      const updatedResult = await connection.query<InvoiceRow>(
        `UPDATE invoices
         SET client_id = $2,
             issue_date = $3,
             due_date = $4,
             currency = $5,
             tax_rate = $6,
             subtotal = $7,
             tax_total = $8,
             grand_total = $9,
             notes = $10,
             updated_at = clock_timestamp()
         WHERE id = $1
         RETURNING ${invoiceColumns}`,
        [
          id,
          input.clientId,
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

      await connection.query("DELETE FROM invoice_items WHERE invoice_id = $1", [id]);
      const items = await insertInvoiceItems(connection, id, input.items);
      await connection.query("COMMIT");
      return toInvoice(updatedResult.rows[0]!, items);
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }
  }

  async deleteDraft(id: string): Promise<boolean> {
    const connection = await this.pool.connect();

    try {
      await connection.query("BEGIN");
      const result = await connection.query<{ status: InvoiceStatus }>(
        `SELECT status
         FROM invoices
         WHERE id = $1
         FOR UPDATE`,
        [id]
      );
      const invoice = result.rows[0];
      if (invoice == null) {
        await connection.query("COMMIT");
        return false;
      }

      if (invoice.status !== "DRAFT") throw new InvoiceNotEditableError();

      await connection.query("DELETE FROM invoices WHERE id = $1", [id]);
      await connection.query("COMMIT");
      return true;
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }
  }

  async list(filters: InvoiceListFilters): Promise<InvoicePage> {
    const parameters: string[] = [];
    const conditions: string[] = [];

    if (filters.status != null) {
      parameters.push(filters.status);
      conditions.push(`i.status = $${parameters.length}::invoice_status`);
    }
    if (filters.clientId != null) {
      parameters.push(filters.clientId);
      conditions.push(`i.client_id = $${parameters.length}::uuid`);
    }

    const where = conditions.length === 0 ? "" : `WHERE ${conditions.join(" AND ")}`;
    const pageParameters: Array<string | number> = [...parameters, filters.limit, filters.offset];
    const limitParameter = parameters.length + 1;
    const offsetParameter = parameters.length + 2;
    const [page, count] = await Promise.all([
      this.pool.query<InvoiceListRow>(
        `SELECT ${selectedInvoiceColumns},
                c.business_name AS client_business_name,
                c.email AS client_email
         FROM invoices i
         JOIN clients c ON c.id = i.client_id
         ${where}
         ORDER BY i.created_at DESC, i.id DESC
         LIMIT $${limitParameter} OFFSET $${offsetParameter}`,
        pageParameters
      ),
      this.pool.query<{ total: string }>(
        `SELECT count(*)::text AS total
         FROM invoices i
         ${where}`,
        parameters
      )
    ]);

    return {
      data: page.rows.map(toInvoiceListItem),
      pagination: {
        limit: filters.limit,
        offset: filters.offset,
        total: Number(count.rows[0]?.total ?? 0)
      }
    };
  }

  async findById(id: string): Promise<InvoiceDetail | null> {
    const [invoice, items] = await Promise.all([
      this.pool.query<InvoiceDetailRow>(
        `SELECT ${selectedInvoiceColumns},
                c.business_name AS client_business_name,
                c.contact_name AS client_contact_name,
                c.email AS client_email,
                c.phone AS client_phone,
                c.billing_address AS client_billing_address,
                c.tax_id AS client_tax_id
         FROM invoices i
         JOIN clients c ON c.id = i.client_id
         WHERE i.id = $1`,
        [id]
      ),
      this.pool.query<InvoiceItemRow>(
        `SELECT id, description, quantity, unit_price, line_total, position
         FROM invoice_items
         WHERE invoice_id = $1
         ORDER BY position`,
        [id]
      )
    ]);

    return invoice.rows[0] == null ? null : toInvoiceDetail(invoice.rows[0], items.rows);
  }
}
