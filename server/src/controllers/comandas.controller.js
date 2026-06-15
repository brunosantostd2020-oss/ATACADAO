import { z } from "zod";
import { query, withTransaction } from "../db/pool.js";
import { ApiError, asyncHandler } from "../utils/asyncHandler.js";

// ---------- helpers ----------
async function loadComanda(id, client = null) {
  const q = (text, params) => (client ? client.query(text, params) : query(text, params));
  const { rows } = await q(
    `SELECT id, customer, phone, status, opened_by, paid_by, payment_method,
            created_at, paid_at
       FROM comandas WHERE id = $1`,
    [id]
  );
  if (!rows[0]) return null;
  const comanda = rows[0];

  const items = await q(
    `SELECT id, product_id, name, price_cents, qty, notes, created_at
       FROM comanda_items WHERE comanda_id = $1 ORDER BY created_at`,
    [id]
  );
  comanda.items = items.rows;
  comanda.total_cents = items.rows.reduce((s, it) => s + it.price_cents * it.qty, 0);

  const pays = await q(
    `SELECT id, amount_cents, payment_method, created_at
       FROM payments WHERE comanda_id = $1 ORDER BY created_at`,
    [id]
  );
  comanda.payments = pays.rows;
  comanda.paid_cents = pays.rows.reduce((s, p) => s + p.amount_cents, 0);
  comanda.remaining_cents = Math.max(0, comanda.total_cents - comanda.paid_cents);

  return comanda;
}

// ---------- schemas ----------
const createSchema = z.object({
  customer:    z.string().min(1, "Nome do cliente obrigatorio."),
  customer_id: z.string().uuid().optional(),
  phone:       z.string().optional(),
});

const addItemSchema = z.object({
  product_id: z.string().uuid("Produto invalido."),
  qty: z.number().int().min(1).default(1),
  notes: z.string().max(200).optional(),
});

const qtySchema = z.object({
  qty: z.number().int().min(0, "Quantidade invalida."),
});

const paySchema = z.object({
  payment_method: z.enum(["dinheiro", "pix", "cartao", "outro"]).default("dinheiro"),
  // amount_cents opcional: se ausente, paga o saldo restante (quitacao total)
  amount_cents: z.number().int().positive().optional(),
});

// ---------- handlers ----------
export const listComandas = asyncHandler(async (req, res) => {
  const status = req.query.status; // open | paid | canceled
  const params = [];
  let where = "";
  if (status) { where = "WHERE status = $1"; params.push(status); }

  const { rows } = await query(
    `SELECT c.id, c.customer, c.phone, c.status, c.payment_method, c.created_at, c.paid_at,
            COALESCE(i.total, 0)::int        AS total_cents,
            COALESCE(i.item_count, 0)::int   AS item_count,
            COALESCE(p.paid, 0)::int         AS paid_cents,
            GREATEST(COALESCE(i.total, 0) - COALESCE(p.paid, 0), 0)::int AS remaining_cents
       FROM comandas c
       LEFT JOIN (
         SELECT comanda_id, SUM(price_cents * qty) AS total, COUNT(*) AS item_count
           FROM comanda_items GROUP BY comanda_id
       ) i ON i.comanda_id = c.id
       LEFT JOIN (
         SELECT comanda_id, SUM(amount_cents) AS paid
           FROM payments GROUP BY comanda_id
       ) p ON p.comanda_id = c.id
      ${where}
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
  const { customer, customer_id, phone } = createSchema.parse(req.body);

  // Busca telefone do cadastro se nao veio no body
  let resolvedPhone = phone ?? null;
  if (!resolvedPhone && customer_id) {
    const { rows: cr } = await query("SELECT phone FROM customers WHERE id=$1", [customer_id]);
    if (cr[0]?.phone) resolvedPhone = cr[0].phone;
  }

  const { rows } = await query(
    `INSERT INTO comandas (customer, customer_id, phone, opened_by)
       VALUES ($1, $2, $3, $4) RETURNING id`,
    [customer, customer_id ?? null, resolvedPhone, req.user.id]
  );

  // Atualiza contador e ultima visita no cadastro
  if (customer_id) {
    await query(
      `UPDATE customers SET visit_count = visit_count + 1, last_visit = now() WHERE id = $1`,
      [customer_id]
    );
  }

  const comanda = await loadComanda(rows[0].id);
  res.status(201).json(comanda);
});

export const addItem = asyncHandler(async (req, res) => {
  const { product_id, qty, notes } = addItemSchema.parse(req.body);
  const comandaId = req.params.id;

  const comanda = await withTransaction(async (client) => {
    const { rows: cRows } = await client.query(
      `SELECT status FROM comandas WHERE id = $1 FOR UPDATE`,
      [comandaId]
    );
    if (!cRows[0]) throw new ApiError(404, "Comanda nao encontrada.");
    if (cRows[0].status !== "open") throw new ApiError(400, "Comanda nao esta aberta.");

    const { rows: pRows } = await client.query(
      `SELECT name, price_cents, active, track_stock FROM products WHERE id = $1`,
      [product_id]
    );
    if (!pRows[0] || !pRows[0].active) throw new ApiError(404, "Produto indisponivel.");

    // upsert: se ja existe o produto na comanda, soma a quantidade
    await client.query(
      `INSERT INTO comanda_items (comanda_id, product_id, name, price_cents, qty, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (comanda_id, product_id)
         DO UPDATE SET qty = comanda_items.qty + EXCLUDED.qty,
                       notes = COALESCE(EXCLUDED.notes, comanda_items.notes)`,
      [comandaId, product_id, pRows[0].name, pRows[0].price_cents, qty, notes ?? null]
    );

    // Desconta do estoque se o produto tiver controle ativo
    if (pRows[0].track_stock) {
      await client.query(
        `UPDATE products
            SET stock_qty = GREATEST(0, stock_qty - $1)
          WHERE id = $2`,
        [qty, product_id]
      );
      await client.query(
        `INSERT INTO stock_movements (product_id, type, qty, reason)
           VALUES ($1, 'saida', $2, 'Lancamento em comanda')`,
        [product_id, -qty]
      );
    }

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
  const { payment_method, amount_cents } = paySchema.parse(req.body);
  const comandaId = req.params.id;

  const comanda = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT status FROM comandas WHERE id = $1 FOR UPDATE`,
      [comandaId]
    );
    if (!rows[0]) throw new ApiError(404, "Comanda nao encontrada.");
    if (rows[0].status === "paid") throw new ApiError(400, "Comanda ja foi quitada.");

    // total dos itens
    const tot = await client.query(
      `SELECT COALESCE(SUM(price_cents * qty), 0)::int AS total,
              COUNT(*)::int AS n
         FROM comanda_items WHERE comanda_id = $1`,
      [comandaId]
    );
    if (tot.rows[0].n === 0) throw new ApiError(400, "Comanda sem itens.");
    const total = tot.rows[0].total;

    // ja pago
    const pd = await client.query(
      `SELECT COALESCE(SUM(amount_cents), 0)::int AS paid
         FROM payments WHERE comanda_id = $1`,
      [comandaId]
    );
    const alreadyPaid = pd.rows[0].paid;
    const remaining = total - alreadyPaid;
    if (remaining <= 0) throw new ApiError(400, "Comanda ja esta quitada.");

    // valor deste pagamento: informado (parcial) ou o saldo todo (quitacao)
    const pay = amount_cents ?? remaining;
    if (pay > remaining) {
      throw new ApiError(400, `Valor maior que o saldo devedor (${remaining} centavos).`);
    }

    await client.query(
      `INSERT INTO payments (comanda_id, amount_cents, payment_method, paid_by)
         VALUES ($1, $2, $3, $4)`,
      [comandaId, pay, payment_method, req.user.id]
    );

    const newPaid = alreadyPaid + pay;
    const quitada = newPaid >= total;

    await client.query(
      `UPDATE comandas
          SET status = $1,
              payment_method = $2,
              paid_at = CASE WHEN $3 THEN now() ELSE paid_at END,
              paid_by = CASE WHEN $3 THEN $4 ELSE paid_by END
        WHERE id = $5`,
      [quitada ? "paid" : "partial", payment_method, quitada, req.user.id, comandaId]
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
  // Comandas que ainda devem (abertas + parciais): saldo = itens - pagamentos
  const { rows: owing } = await query(
    `SELECT
       COUNT(*)::int AS count,
       COALESCE(SUM(GREATEST(t.total - t.paid, 0)), 0)::int AS remaining_cents
     FROM (
       SELECT c.id,
              COALESCE((SELECT SUM(price_cents*qty) FROM comanda_items WHERE comanda_id=c.id),0) AS total,
              COALESCE((SELECT SUM(amount_cents)   FROM payments      WHERE comanda_id=c.id),0) AS paid
         FROM comandas c
        WHERE c.status IN ('open','partial')
     ) t`
  );

  // Recebido hoje (qualquer pagamento registrado hoje)
  const { rows: today } = await query(
    `SELECT COALESCE(SUM(amount_cents), 0)::int AS total_cents,
            COUNT(*)::int AS count
       FROM payments
      WHERE created_at::date = now()::date`
  );

  res.json({
    open_count: owing[0].count,
    open_total_cents: owing[0].remaining_cents,
    paid_today_count: today[0].count,
    paid_today_cents: today[0].total_cents,
  });
});

// Salva ou atualiza o telefone do cliente na comanda
export const updatePhone = asyncHandler(async (req, res) => {
  const phone = (req.body.phone ?? "").toString().trim();
  const { rows } = await query(
    `UPDATE comandas SET phone = $1 WHERE id = $2
       RETURNING id, customer, phone`,
    [phone || null, req.params.id]
  );
  if (!rows[0]) throw new ApiError(404, "Comanda nao encontrada.");
  res.json(rows[0]);
});
