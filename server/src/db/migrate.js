import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pool } from "./pool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const sql = readFileSync(join(__dirname, "schema.sql"), "utf-8");
  console.log("[migrate] Aplicando schema...");
  await pool.query(sql);
  console.log("[migrate] Schema aplicado com sucesso.");
  await pool.end();
}

migrate().catch((err) => {
  console.error("[migrate] Falhou:", err);
  process.exit(1);
});
