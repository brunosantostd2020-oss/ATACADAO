import { z } from "zod";
import { query, withTransaction } from "../db/pool.js";
import { ApiError, asyncHandler } from "../utils/asyncHandler.js";

const productSchema = z.object({
  name:         z.string().min(1, "Nome obrigatorio."),
  price_cents:  z.number().int().min(0, "Preco invalido."),
  category:     z.string().min(1).default("geral"),
  active:       z.boolean().default(true),
  track_stock:  z.boolean().default(false),
  stock_qty:    z.number().int().min(0).default(0),
  stock_min:    z.number().int().min(0).default(5),
});

const updateSchema = productSchema.partial();

const stockEntrySchema = z.object({
  qty:    z.number().int().min(1, "Quantidade invalida."),
  reason: z.string().default("Entrada de estoque"),
});

const stockAdjustSchema = z.object({
  qty:    z.number().int(),
  reason: z.string().default("Ajuste manual"),
});

export const listProducts = asyncHandler(async (req, res) => {
  const includeInactive = req.query.all === "true";
  const { rows } = await query(
    `SELECT id, name, price_cents, category, active,
            track_stock, stock_qty, stock_min,
            CASE WHEN track_stock AND stock_qty <= stock_min THEN true ELSE false END AS low_stock,
            created_at
       FROM products
      ${includeInactive ? "" : "WHERE active = TRUE"}
      ORDER BY category, name`
  );
  res.json(rows);
});

export const createProduct = asyncHandler(async (req, res) => {
  const data = productSchema.parse(req.body);
  const { rows } = await query(
    `INSERT INTO products (name, price_cents, category, active, track_stock, stock_qty, stock_min)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, price_cents, category, active, track_stock, stock_qty, stock_min, created_at`,
    [data.name, data.price_cents, data.category, data.active,
     data.track_stock, data.stock_qty, data.stock_min]
  );
  // registra entrada inicial se tiver estoque
  if (data.track_stock && data.stock_qty > 0) {
    await query(
      `INSERT INTO stock_movements (product_id, type, qty, reason, created_by)
         VALUES ($1, 'entrada', $2, 'Estoque inicial', $3)`,
      [rows[0].id, data.stock_qty, req.user.id]
    );
  }
  res.status(201).json(rows[0]);
});

export const updateProduct = asyncHandler(async (req, res) => {
  const data = updateSchema.parse(req.body);
  const fields = [];
  const values = [];
  let i = 1;
  for (const key of ["name", "price_cents", "category", "active", "track_stock", "stock_min"]) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${i++}`);
      values.push(data[key]);
    }
  }
  if (fields.length === 0) throw new ApiError(400, "Nada para atualizar.");
  values.push(req.params.id);
  const { rows } = await query(
    `UPDATE products SET ${fields.join(", ")} WHERE id = $${i}
       RETURNING id, name, price_cents, category, active, track_stock, stock_qty, stock_min, created_at`,
    values
  );
  if (!rows[0]) throw new ApiError(404, "Produto nao encontrado.");
  res.json(rows[0]);
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `UPDATE products SET active = FALSE WHERE id = $1 RETURNING id`,
    [req.params.id]
  );
  if (!rows[0]) throw new ApiError(404, "Produto nao encontrado.");
  res.status(204).end();
});

// Entrada de estoque (compra/reposicao)
export const stockEntry = asyncHandler(async (req, res) => {
  const { qty, reason } = stockEntrySchema.parse(req.body);
  const result = await withTransaction(async (client) => {
    const { rows: prod } = await client.query(
      `UPDATE products SET stock_qty = stock_qty + $1 WHERE id = $2 AND track_stock = TRUE
         RETURNING id, name, stock_qty, stock_min`,
      [qty, req.params.id]
    );
    if (!prod[0]) throw new ApiError(404, "Produto nao encontrado ou sem controle de estoque.");
    await client.query(
      `INSERT INTO stock_movements (product_id, type, qty, reason, created_by)
         VALUES ($1, 'entrada', $2, $3, $4)`,
      [req.params.id, qty, reason, req.user.id]
    );
    return prod[0];
  });
  res.json(result);
});

// Ajuste manual (correcao de inventario)
export const stockAdjust = asyncHandler(async (req, res) => {
  const { qty, reason } = stockAdjustSchema.parse(req.body);
  const result = await withTransaction(async (client) => {
    const { rows: prod } = await client.query(
      `UPDATE products SET stock_qty = $1 WHERE id = $2 AND track_stock = TRUE
         RETURNING id, name, stock_qty, stock_min`,
      [Math.max(0, qty), req.params.id]
    );
    if (!prod[0]) throw new ApiError(404, "Produto nao encontrado ou sem controle de estoque.");
    await client.query(
      `INSERT INTO stock_movements (product_id, type, qty, reason, created_by)
         VALUES ($1, 'ajuste', $2, $3, $4)`,
      [req.params.id, qty, reason, req.user.id]
    );
    return prod[0];
  });
  res.json(result);
});

// Historico de movimentacoes
export const stockHistory = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT m.id, m.type, m.qty, m.reason, m.created_at,
            u.name AS user_name
       FROM stock_movements m
       LEFT JOIN users u ON u.id = m.created_by
      WHERE m.product_id = $1
      ORDER BY m.created_at DESC
      LIMIT 50`,
    [req.params.id]
  );
  res.json(rows);
});

// Painel geral de estoque
export const stockPanel = asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `SELECT id, name, category, price_cents, stock_qty, stock_min,
            CASE WHEN stock_qty = 0 THEN 'esgotado'
                 WHEN stock_qty <= stock_min THEN 'baixo'
                 ELSE 'ok' END AS stock_status
       FROM products
      WHERE active = TRUE AND track_stock = TRUE
      ORDER BY stock_qty ASC, name`
  );
  res.json(rows);
});
