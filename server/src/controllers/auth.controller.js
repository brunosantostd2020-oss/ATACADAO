import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { query } from "../db/pool.js";
import { config } from "../config/env.js";
import { ApiError, asyncHandler } from "../utils/asyncHandler.js";

const loginSchema = z.object({
  email: z.string().email("E-mail invalido."),
  password: z.string().min(1, "Senha obrigatoria."),
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  const { rows } = await query(
    `SELECT id, name, email, password_hash, role, active
       FROM users WHERE email = $1`,
    [email.toLowerCase()]
  );
  const user = rows[0];

  if (!user || !user.active) {
    throw new ApiError(401, "Credenciais invalidas.");
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    throw new ApiError(401, "Credenciais invalidas.");
  }

  const token = jwt.sign(
    { sub: user.id, role: user.role, name: user.name },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

export const me = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT id, name, email, role, active, created_at
       FROM users WHERE id = $1`,
    [req.user.id]
  );
  if (!rows[0]) throw new ApiError(404, "Usuario nao encontrado.");
  res.json(rows[0]);
});
