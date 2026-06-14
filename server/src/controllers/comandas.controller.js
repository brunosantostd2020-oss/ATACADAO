import { z } from "zod";
import { query, withTransaction } from "../db/pool.js";
import { ApiError, asyncHandler } from "../utils/asyncHandler.js";

// ---------- helpers ----------
async function loadComanda(id, client = null) {
  const q = (text, params) => (client ? client.query(text, params) : query(text, params));
  const { rows } = await q(
    `SELECT id, customer, status, opened_by, paid_by, payment_method,
            created_at, paid_at
       FROM comandas WHERE id = $1`,
    [id]
  );
  if (!rows[0]) return null;
  const comanda = rows[0];
  const items = await q(
    `SELECT id, product_id, name, price_cents, qty
       FROM comanda_items WHERE comanda_id = $1 ORDER BY created_at`,
    [id]
  );
  comanda.items = items.rows;
  comanda.total_cents = items.rows.reduce((s, it) => s + it.price_cents * it.qty, 0);
  return comanda;
}

// ---------- schemas ----------
const createSchema = z.object({
  customer: z.string().min(1, "Nome do cliente obrigatorio."),
});

const addItemSchema = z.object({
  product_id: z.string().uuid("Produto invalido."),
  qty: z.number().int().min(1).default(1),
});

const qtySchema = z.object({
  qty: z.number().int().min(0, "Quantidade invalida."),
});

const paySchema = z.object({
  payment_method: z.enum(["dinheiro", "pix", "cartao", "outro"]).default("dinheiro"),
});

// ---------- handlers ----------
export const listComandas = asyncHandler(async (req, res) => {
  const status = req.query.status; // open | paid | canceled
  const params = [];
  let where = "";
  if (status) { where = "WHERE status = $1"; params.push(status); }

  const { rows } = await query(
    `SELECT c.id, c.customer, c.status, c.payment_method, c.created_at, c.paid_at,
            COALESCE(SUM(i.price_cents * i.qty), 0)::int AS total_cents,
            COALESCE(COUNT(i.id), 0)::int AS item_count
       FROM comandas c
       LEFT JOIN comanda_items i ON i.comanda_id = c.id
      ${where}
      GROUP BY c.id
      ORDER BY c.created_at DESC`,
    params
  );
  res.json(rows);
});

export const getComanda = asyncHandler(async (req, res) => {
  const comanda = await loadComanda(req.params.id);
  if (!comanda) throw new ApiError(404, "Comanda nao encontrada.");
  res.json(comanda);
});

export const createComanda = asyncHandler(async (req, res) => {
  const { customer } = createSchema.parse(req.body);
  const { rows } = await query(
    `INSERT INTO comandas (customer, opened_by) VALUES ($1, $2)
       RETURNING id`,
    [customer, req.user.id]
  );
  const comanda = await loadComanda(rows[0].id);
  res.status(201).json(comanda);
});

export const addItem = asyncHandler(async (req, res) => {
  const { product_id, qty } = addItemSchema.parse(req.body);
  const comandaId = req.params.id;

  const comanda = await withTransaction(async (client) => {
    const { rows: cRows } = await client.query(
      `SELECT status FROM comandas WHERE id = $1 FOR UPDATE`,
      [comandaId]
    );
    if (!cRows[0]) throw new ApiError(404, "Comanda nao encontrada.");
    if (cRows[0].status !== "open") throw new ApiError(400, "Comanda nao esta aberta.");

    const { rows: pRows } = await client.query(
      `SELECT name, price_cents, active FROM products WHERE id = $1`,
      [product_id]
    );
    if (!pRows[0] || !pRows[0].active) throw new ApiError(404, "Produto indisponivel.");

    // upsert: se ja existe o produto na comanda, soma a quantidade
    await client.query(
      `INSERT INTO comanda_items (comanda_id, product_id, name, price_cents, qty)
         VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (comanda_id, product_id)
         DO UPDATE SET qty = comanda_items.qty + EXCLUDED.qty`,
      [comandaId, product_id, pRows[0].name, pRows[0].price_cents, qty]
    );

    return loadComanda(comandaId, client);
  });

  res.status(201).json(comanda);
});

export const updateItemQty = asyncHandler(async (req, res) => {
  const { qty } = qtySchema.parse(req.body);
  const { id: comandaId, itemId } = req.params;

  const comanda = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT c.status FROM comandas c WHERE c.id = $1 FOR UPDATE`,
      [comandaId]
    );
    if (!rows[0]) throw new ApiError(404, "Comanda nao encontrada.");
    if (rows[0].status !== "open") throw new ApiError(400, "Comanda nao esta aberta.");

    if (qty === 0) {
      await client.query(
        `DELETE FROM comanda_items WHERE id = $1 AND comanda_id = $2`,
        [itemId, comandaId]
      );
    } else {
      const upd = await client.query(
        `UPDATE comanda_items SET qty = $1
           WHERE id = $2 AND comanda_id = $3 RETURNING id`,
        [qty, itemId, comandaId]
      );
      if (!upd.rows[0]) throw new ApiError(404, "Item nao encontrado.");
    }
    return loadComanda(comandaId, client);
  });

  res.json(comanda);
});

export const removeItem = asyncHandler(async (req, res) => {
  const { id: comandaId, itemId } = req.params;
  const { rowCount } = await query(
    `DELETE FROM comanda_items WHERE id = $1 AND comanda_id = $2`,
    [itemId, comandaId]
  );
  if (rowCount === 0) throw new ApiError(404, "Item nao encontrado.");
  const comanda = await loadComanda(comandaId);
  res.json(comanda);
});

export const payComanda = asyncHandler(async (req, res) => {
  const { payment_method } = paySchema.parse(req.body);
  const comandaId = req.params.id;

  const comanda = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT status FROM comandas WHERE id = $1 FOR UPDATE`,
      [comandaId]
    );
    if (!rows[0]) throw new ApiError(404, "Comanda nao encontrada.");
    if (rows[0].status === "paid") throw new ApiError(400, "Comanda ja foi paga.");

    const items = await client.query(
      `SELECT COUNT(*)::int AS n FROM comanda_items WHERE comanda_id = $1`,
      [comandaId]
    );
    if (items.rows[0].n === 0) throw new ApiError(400, "Comanda sem itens.");

    await client.query(
      `UPDATE comandas
          SET status = 'paid', paid_at = now(), paid_by = $1, payment_method = $2
        WHERE id = $3`,
      [req.user.id, payment_method, comandaId]
    );
    return loadComanda(comandaId, client);
  });

  res.json(comanda);
});

export const deleteComanda = asyncHandler(async (req, res) => {
  const { rowCount } = await query("DELETE FROM comandas WHERE id = $1", [req.params.id]);
  if (rowCount === 0) throw new ApiError(404, "Comanda nao encontrada.");
  res.status(204).end();
});

// ---------- relatorio simples ----------
export const summary = asyncHandler(async (_req, res) => {
  const { rows: open } = await query(
    `SELECT COUNT(DISTINCT c.id)::int AS count,
            COALESCE(SUM(i.price_cents * i.qty), 0)::int AS total_cents
       FROM comandas c LEFT JOIN comanda_items i ON i.comanda_id = c.id
      WHERE c.status = 'open'`
  );
  const { rows: today } = await query(
    `SELECT COALESCE(SUM(i.price_cents * i.qty), 0)::int AS total_cents,
            COUNT(DISTINCT c.id)::int AS count
       FROM comandas c JOIN comanda_items i ON i.comanda_id = c.id
      WHERE c.status = 'paid' AND c.paid_at::date = now()::date`
  );
  res.json({
    open_count: open[0].count,
    open_total_cents: open[0].total_cents,
    paid_today_count: today[0].count,
    paid_today_cents: today[0].total_cents,
  });
});
