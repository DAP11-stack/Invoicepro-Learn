import { Pool } from "pg";

import { environment } from "../config/env.js";

export const pool = new Pool({
  connectionString: environment.DATABASE_URL
});

export async function checkDatabaseHealth(): Promise<void> {
  await pool.query("SELECT 1");
}
