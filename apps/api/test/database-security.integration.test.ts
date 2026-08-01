import { afterAll, describe, expect, it } from "vitest";

import { pool } from "../src/db/pool.js";

afterAll(async () => {
  await pool.end();
});

describe("application database role", () => {
  it("can access business tables but not migration metadata", async () => {
    const result = await pool.query<{
      clients_select: boolean;
      clients_insert: boolean;
      migrations_select: boolean;
      migrations_insert: boolean;
      migrations_update: boolean;
      migrations_delete: boolean;
      invoice_sequence_usage: boolean;
      invoice_sequence_select: boolean;
    }>(`
      SELECT
        has_table_privilege(current_user, 'public.clients', 'SELECT') AS clients_select,
        has_table_privilege(current_user, 'public.clients', 'INSERT') AS clients_insert,
        has_table_privilege(current_user, 'public.schema_migrations', 'SELECT') AS migrations_select,
        has_table_privilege(current_user, 'public.schema_migrations', 'INSERT') AS migrations_insert,
        has_table_privilege(current_user, 'public.schema_migrations', 'UPDATE') AS migrations_update,
        has_table_privilege(current_user, 'public.schema_migrations', 'DELETE') AS migrations_delete,
        has_sequence_privilege(current_user, 'public.invoice_number_sequence', 'USAGE') AS invoice_sequence_usage,
        has_sequence_privilege(current_user, 'public.invoice_number_sequence', 'SELECT') AS invoice_sequence_select
    `);

    expect(result.rows[0]).toEqual({
      clients_select: true,
      clients_insert: true,
      migrations_select: false,
      migrations_insert: false,
      migrations_update: false,
      migrations_delete: false,
      invoice_sequence_usage: true,
      invoice_sequence_select: true
    });
  });
});
