import { z } from "zod";
import { query } from "../db/pool.js";
import { ApiError, asyncHandler } from "../utils/asyncHandler.js";

const customerSchema = z.object({
  name:  z.string().min(1, "Nome obrigatorio."),
  phone: z.string().optional(),
  notes: z.string().optional(),
});

// Busca por nome (autocomplete) — minimo 1 caractere
export const searchCustomers = asyncHandler(async (req, res) => {
  const q = (req.query.q ?? "").toString().trim();
  if (!q) return res.json([]);

  const { rows } = await query(
    `SELECT id, name, phone, notes, visit_count, last_visit
       FROM customers
      WHERE lower(name) LIKE lower($1)
      ORDER BY visit_count DESC, name
      LIMIT 10`,
    [`%${q}%`]
  );
  res.json(rows);
});

// Listar todos
export const listCustomers = asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `SELECT c.id, c.name, c.phone, c.notes, c.visit_count, c.last_visit, c.created_at,
            COUNT(cmd.id)::int AS total_comandas,
            COALESCE(SUM(GREATEST(
              COALESCE((SELECT SUM(price_cents*qty) FROM comanda_items WHERE comanda_id=cmd.id),0) -
              COALESCE((SELECT SUM(amount_cents)   FROM payments       WHERE comanda_id=cmd.id),0)
            ,0)),0)::int AS total_devendo_cents
       FROM customers c
       LEFT JOIN comandas cmd ON cmd.customer_id = c.id
      GROUP BY c.id
      ORDER BY c.visit_count DESC, c.name`
  );
  res.json(rows);
});

// Criar cliente
export const createCustomer = asyncHandler(async (req, res) => {
  const data = customerSchema.parse(req.body);
  const { rows } = await query(
    `INSERT INTO customers (name, phone, notes)
       VALUES ($1, $2, $3)
       RETURNING id, name, phone, notes, visit_count, created_at`,
    [data.name, data.phone ?? null, data.notes ?? null]
  );
  res.status(201).json(rows[0]);
});

// Atualizar cliente
export const updateCustomer = asyncHandler(async (req, res) => {
  const data = customerSchema.partial().parse(req.body);
  const fields = [];
  const values = [];
  let i = 1;
  if (data.name  !== undefined) { fields.push(`name  = $${i++}`); values.push(data.name); }
  if (data.phone !== undefined) { fields.push(`phone = $${i++}`); values.push(data.phone || null); }
  if (data.notes !== undefined) { fields.push(`notes = $${i++}`); values.push(data.notes || null); }
  if (!fields.length) throw new ApiError(400, "Nada para atualizar.");
  values.push(req.params.id);
  const { rows } = await query(
    `UPDATE customers SET ${fields.join(", ")} WHERE id = $${i}
       RETURNING id, name, phone, notes, visit_count, created_at`,
    values
  );
  if (!rows[0]) throw new ApiError(404, "Cliente nao encontrado.");
  res.json(rows[0]);
});

// Excluir cliente
export const deleteCustomer = asyncHandler(async (req, res) => {
  const { rowCount } = await query("DELETE FROM customers WHERE id = $1", [req.params.id]);
  if (rowCount === 0) throw new ApiError(404, "Cliente nao encontrado.");
  res.status(204).end();
});

// Historico de comandas do cliente
export const customerHistory = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT c.id, c.created_at, c.status, c.payment_method, c.paid_at,
            COALESCE(SUM(i.price_cents * i.qty), 0)::int AS total_cents,
            COALESCE(SUM(p.amount_cents), 0)::int         AS paid_cents
       FROM comandas c
       LEFT JOIN comanda_items i ON i.comanda_id = c.id
       LEFT JOIN payments p       ON p.comanda_id = c.id
      WHERE c.customer_id = $1
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT 20`,
    [req.params.id]
  );
  res.json(rows);
});
