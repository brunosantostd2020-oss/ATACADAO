import bcrypt from "bcryptjs";
import { z } from "zod";
import { query } from "../db/pool.js";
import { ApiError, asyncHandler } from "../utils/asyncHandler.js";

const createSchema = z.object({
  name: z.string().min(1, "Nome obrigatorio."),
  email: z.string().email("E-mail invalido."),
  password: z.string().min(6, "Senha deve ter ao menos 6 caracteres."),
  role: z.enum(["admin", "caixa", "garcom"]).default("garcom"),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(["admin", "caixa", "garcom"]).optional(),
  active: z.boolean().optional(),
});

export const listUsers = asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `SELECT id, name, email, role, active, created_at
       FROM users ORDER BY created_at DESC`
  );
  res.json(rows);
});

export const createUser = asyncHandler(async (req, res) => {
  const data = createSchema.parse(req.body);
  const hash = await bcrypt.hash(data.password, 10);
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, active, created_at`,
    [data.name, data.email.toLowerCase(), hash, data.role]
  );
  res.status(201).json(rows[0]);
});

export const updateUser = asyncHandler(async (req, res) => {
  const data = updateSchema.parse(req.body);
  const fields = [];
  const values = [];
  let i = 1;

  if (data.name !== undefined) { fields.push(`name = $${i++}`); values.push(data.name); }
  if (data.email !== undefined) { fields.push(`email = $${i++}`); values.push(data.email.toLowerCase()); }
  if (data.role !== undefined) { fields.push(`role = $${i++}`); values.push(data.role); }
  if (data.active !== undefined) { fields.push(`active = $${i++}`); values.push(data.active); }
  if (data.password !== undefined) {
    const hash = await bcrypt.hash(data.password, 10);
    fields.push(`password_hash = $${i++}`); values.push(hash);
  }

  if (fields.length === 0) throw new ApiError(400, "Nada para atualizar.");
  values.push(req.params.id);

  const { rows } = await query(
    `UPDATE users SET ${fields.join(", ")} WHERE id = $${i}
       RETURNING id, name, email, role, active, created_at`,
    values
  );
  if (!rows[0]) throw new ApiError(404, "Usuario nao encontrado.");
  res.json(rows[0]);
});

export const deleteUser = asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) {
    throw new ApiError(400, "Voce nao pode excluir o proprio usuario.");
  }
  const { rowCount } = await query("DELETE FROM users WHERE id = $1", [req.params.id]);
  if (rowCount === 0) throw new ApiError(404, "Usuario nao encontrado.");
  res.status(204).end();
});
