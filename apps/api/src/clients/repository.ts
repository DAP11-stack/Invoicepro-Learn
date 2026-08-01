import type { Pool } from "pg";

import type {
  Client,
  ClientPage,
  ClientService,
  CreateClientInput,
  UpdateClientInput
} from "./types.js";

interface ClientRow {
  id: string;
  business_name: string;
  contact_name: string | null;
  email: string;
  phone: string | null;
  billing_address: string;
  tax_id: string | null;
  created_at: Date;
  updated_at: Date;
}

function toClient(row: ClientRow): Client {
  return {
    id: row.id,
    businessName: row.business_name,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone,
    billingAddress: row.billing_address,
    taxId: row.tax_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

const clientColumns = `
  id, business_name, contact_name, email, phone, billing_address, tax_id,
  created_at, updated_at
`;

export class PostgresClientRepository implements ClientService {
  constructor(private readonly pool: Pool) {}

  async list(limit: number, offset: number): Promise<ClientPage> {
    const [clients, count] = await Promise.all([
      this.pool.query<ClientRow>(
        `SELECT ${clientColumns}
         FROM clients
         ORDER BY created_at DESC, id DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      this.pool.query<{ total: string }>("SELECT count(*)::text AS total FROM clients")
    ]);

    return {
      data: clients.rows.map(toClient),
      pagination: { limit, offset, total: Number(count.rows[0]?.total ?? 0) }
    };
  }

  async create(input: CreateClientInput): Promise<Client> {
    const result = await this.pool.query<ClientRow>(
      `INSERT INTO clients (
        business_name, contact_name, email, phone, billing_address, tax_id
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING ${clientColumns}`,
      [
        input.businessName,
        input.contactName ?? null,
        input.email,
        input.phone ?? null,
        input.billingAddress,
        input.taxId ?? null
      ]
    );

    return toClient(result.rows[0]!);
  }

  async findById(id: string): Promise<Client | null> {
    const result = await this.pool.query<ClientRow>(
      `SELECT ${clientColumns} FROM clients WHERE id = $1`,
      [id]
    );

    return result.rows[0] == null ? null : toClient(result.rows[0]);
  }

  async update(id: string, input: UpdateClientInput): Promise<Client | null> {
    const columnByField = {
      businessName: "business_name",
      contactName: "contact_name",
      email: "email",
      phone: "phone",
      billingAddress: "billing_address",
      taxId: "tax_id"
    } as const;
    const entries = Object.entries(input).filter(([, value]) => value !== undefined) as [
      keyof typeof columnByField,
      string | null
    ][];
    const assignments = entries.map(([field], index) => `${columnByField[field]} = $${index + 1}`);
    const values = entries.map(([, value]) => value);

    const result = await this.pool.query<ClientRow>(
      `UPDATE clients
       SET ${assignments.join(", ")}, updated_at = now()
       WHERE id = $${values.length + 1}
       RETURNING ${clientColumns}`,
      [...values, id]
    );

    return result.rows[0] == null ? null : toClient(result.rows[0]);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query("DELETE FROM clients WHERE id = $1", [id]);
    return result.rowCount === 1;
  }
}
