import pg from "pg";
import { config, isProd } from "../config/env.js";

const { Pool } = pg;

// Railway/Heroku exigem SSL em producao. Em dev local normalmente nao.
const needsSsl =
  isProd || /railway|render|heroku|amazonaws|supabase/.test(config.databaseUrl);

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (err) => {
  console.error("[db] Erro inesperado no pool do PostgreSQL:", err);
});

/**
 * Executa uma query parametrizada.
 * @param {string} text SQL com placeholders $1, $2...
 * @param {Array} params Valores
 */
export function query(text, params) {
  return pool.query(text, params);
}

/**
 * Executa uma serie de queries dentro de uma transacao.
 * O callback recebe um client; se lancar erro, faz ROLLBACK.
 */
export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
