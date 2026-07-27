import { createApp } from "./app.js";
import { environment } from "./config/env.js";
import { checkDatabaseHealth, pool } from "./db/pool.js";

const app = createApp({ healthCheck: checkDatabaseHealth });

const server = app.listen(environment.PORT, () => {
  console.log(`InvoicePro API listening on port ${environment.PORT}`);
});

async function closeServer(signal: string) {
  console.log(`${signal} received. Shutting down.`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.once("SIGINT", () => void closeServer("SIGINT"));
process.once("SIGTERM", () => void closeServer("SIGTERM"));
