// Inicializacao para producao (Railway): aplica o schema, garante o admin/
// produtos padrao e entao sobe o servidor — tudo no mesmo processo, sem
// fechar o pool no meio. Seguro para rodar a cada deploy (idempotente).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import bcrypt from "bcryptjs";
import { pool } from "./db/pool.js";
import { config } from "./config/env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Tenta conectar no banco com algumas tentativas antes de desistir.
async function waitForDatabase(retries = 10, delayMs = 3000) {
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (err) {
      console.warn(
        `[bootstrap] Banco ainda indisponivel (tentativa ${i}/${retries}): ${err.code ?? err.message}`
      );
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

const DEFAULT_PRODUCTS = [
  { name: "Heineken 600ml", price_cents: 1500, category: "cervejas" },
  { name: "Brahma 600ml", price_cents: 1200, category: "cervejas" },
  { name: "Skol Lata", price_cents: 600, category: "cervejas" },
  { name: "Original 600ml", price_cents: 1400, category: "cervejas" },
  { name: "Stella Artois", price_cents: 1300, category: "cervejas" },
  { name: "Corona Long Neck", price_cents: 1100, category: "cervejas" },
  { name: "Porcao de Calabresa", price_cents: 3500, category: "porcoes" },
  { name: "Porcao de Batata", price_cents: 2800, category: "porcoes" },
  { name: "Refrigerante", price_cents: 700, category: "bebidas" },
  { name: "Agua Mineral", price_cents: 400, category: "bebidas" },
];

/**
 * Prepara o banco: schema, login padrao e produtos. NAO sobe servidor.
 * Idempotente — seguro rodar a cada deploy. Usado pelo server combinado.
 */
export async function runBootstrap() {
  // Aguarda o banco ficar acessivel (no Railway o DNS interno pode
  // demorar alguns segundos apos o container subir).
  await waitForDatabase();

  // 1) Schema
  const sql = readFileSync(join(__dirname, "db", "schema.sql"), "utf-8");
  console.log("[bootstrap] Aplicando schema...");
  await pool.query(sql);

  // 2) Login padrao — garante que SEMPRE exista com a senha definida.
  // Se o usuario ja existe, atualiza a senha/role (evita ficar trancado fora).
  const hash = await bcrypt.hash(config.seedAdminPassword, 10);
  await pool.query(
    `INSERT INTO users (name, username, password_hash, role)
       VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (username)
       DO UPDATE SET password_hash = EXCLUDED.password_hash,
                     role = 'admin',
                     active = TRUE`,
    [config.seedAdminName, config.seedAdminUser.toLowerCase(), hash]
  );
  console.log(`[bootstrap] Login garantido: usuario "${config.seedAdminUser}".`);

  // 3) Produtos padrao (so se a tabela estiver vazia)
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM products");
  if (rows[0].n === 0) {
    for (const p of DEFAULT_PRODUCTS) {
      await pool.query(
        `INSERT INTO products (name, price_cents, category) VALUES ($1, $2, $3)`,
        [p.name, p.price_cents, p.category]
      );
    }
    console.log(`[bootstrap] ${DEFAULT_PRODUCTS.length} produtos inseridos.`);
  }

  console.log("[bootstrap] Banco pronto.");
}

// Modo standalone: se chamado direto (node src/bootstrap.js), prepara o
// banco e sobe a API sozinha (usado no deploy SO da API, se um dia separar).
const isMain = process.argv[1] && process.argv[1].endsWith("bootstrap.js");
if (isMain) {
  runBootstrap()
    .then(() => import("./index.js"))
    .catch((err) => {
      console.error("[bootstrap] Falhou:", err);
      process.exit(1);
    });
}
