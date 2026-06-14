import { z } from "zod";
import { query } from "../db/pool.js";
import { ApiError, asyncHandler } from "../utils/asyncHandler.js";

const productSchema = z.object({
  name: z.string().min(1, "Nome obrigatorio."),
  price_cents: z.number().int().min(0, "Preco invalido."),
  category: z.string().min(1).default("geral"),
  active: z.boolean().default(true),
});

const updateSchema = productSchema.partial();

export const listProducts = asyncHandler(async (req, res) => {
  const includeInactive = req.query.all === "true";
  const { rows } = await query(
    `SELECT id, name, price_cents, category, active, created_at
       FROM products
      ${includeInactive ? "" : "WHERE active = TRUE"}
      ORDER BY category, name`
  );
  res.json(rows);
});

export const createProduct = asyncHandler(async (req, res) => {
  const data = productSchema.parse(req.body);
  const { rows } = await query(
    `INSERT INTO products (name, price_cents, category, active)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, price_cents, category, active, created_at`,
    [data.name, data.price_cents, data.category, data.active]
  );
  res.status(201).json(rows[0]);
});

export const updateProduct = asyncHandler(async (req, res) => {
  const data = updateSchema.parse(req.body);
  const fields = [];
  const values = [];
  let i = 1;
  for (const key of ["name", "price_cents", "category", "active"]) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${i++}`);
      values.push(data[key]);
    }
  }
  if (fields.length === 0) throw new ApiError(400, "Nada para atualizar.");
  values.push(req.params.id);
  const { rows } = await query(
    `UPDATE products SET ${fields.join(", ")} WHERE id = $${i}
       RETURNING id, name, price_cents, category, active, created_at`,
    values
  );
  if (!rows[0]) throw new ApiError(404, "Produto nao encontrado.");
  res.json(rows[0]);
});

export const deleteProduct = asyncHandler(async (req, res) => {
  // Soft delete para preservar historico de itens lancados
  const { rows } = await query(
    `UPDATE products SET active = FALSE WHERE id = $1 RETURNING id`,
    [req.params.id]
  );
  if (!rows[0]) throw new ApiError(404, "Produto nao encontrado.");
  res.status(204).end();
});
