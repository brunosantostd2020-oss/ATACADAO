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

migrate().catch(async (err) => {
  // Durante o BUILD do Railway o banco ainda nao esta acessivel
  // (postgres.railway.internal so resolve em runtime). Nesses casos
  // nao quebramos o build: o schema sera aplicado quando a API subir
  // (ver src/bootstrap.js). So tratamos como erro fatal se NAO for
  // problema de conexao/DNS.
  const networkErr =
    err && (err.code === "ENOTFOUND" || err.code === "ECONNREFUSED" ||
            err.code === "EAI_AGAIN" || err.code === "ETIMEDOUT");

  if (networkErr) {
    console.warn(
      "[migrate] Banco indisponivel agora (provavelmente build). " +
      "O schema sera aplicado quando a API iniciar. Seguindo..."
    );
    try { await pool.end(); } catch {}
    process.exit(0); // NAO falha o build
  }

  console.error("[migrate] Falhou:", err);
  process.exit(1);
});
