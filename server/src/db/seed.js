import bcrypt from "bcryptjs";
import { pool } from "./pool.js";
import { config } from "../config/env.js";

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

async function seed() {
  console.log("[seed] Criando admin padrao...");
  const hash = await bcrypt.hash(config.seedAdminPassword, 10);
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (email) DO NOTHING`,
    [config.seedAdminName, config.seedAdminEmail.toLowerCase(), hash]
  );

  console.log("[seed] Inserindo produtos padrao...");
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM products");
  if (rows[0].n === 0) {
    for (const p of DEFAULT_PRODUCTS) {
      await pool.query(
        `INSERT INTO products (name, price_cents, category) VALUES ($1, $2, $3)`,
        [p.name, p.price_cents, p.category]
      );
    }
    console.log(`[seed] ${DEFAULT_PRODUCTS.length} produtos inseridos.`);
  } else {
    console.log("[seed] Produtos ja existem, pulando.");
  }

  console.log("\n[seed] Concluido!");
  console.log(`  Login admin: ${config.seedAdminEmail}`);
  console.log(`  Senha:       ${config.seedAdminPassword}`);
  console.log("  (troque a senha apos o primeiro acesso)\n");
  await pool.end();
}

seed().catch(async (err) => {
  const networkErr =
    err && (err.code === "ENOTFOUND" || err.code === "ECONNREFUSED" ||
            err.code === "EAI_AGAIN" || err.code === "ETIMEDOUT");
  if (networkErr) {
    console.warn("[seed] Banco indisponivel agora (build). Sera feito ao iniciar a API.");
    try { await pool.end(); } catch {}
    process.exit(0);
  }
  console.error("[seed] Falhou:", err);
  process.exit(1);
});
