import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { query } from "../db/pool.js";
import { config } from "../config/env.js";
import { ApiError, asyncHandler } from "../utils/asyncHandler.js";

const loginSchema = z.object({
  username: z.string().min(1, "Usuario obrigatorio."),
  password: z.string().min(1, "Senha obrigatoria."),
});

export const login = asyncHandler(async (req, res) => {
  const { username, password } = loginSchema.parse(req.body);

  const { rows } = await query(
    `SELECT id, name, username, password_hash, role, active
       FROM users WHERE username = $1`,
    [username.toLowerCase()]
  );
  const user = rows[0];

  if (!user || !user.active) {
    throw new ApiError(401, "Usuario ou senha invalidos.");
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    throw new ApiError(401, "Usuario ou senha invalidos.");
  }

  const token = jwt.sign(
    { sub: user.id, role: user.role, name: user.name },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, username: user.username, role: user.role },
  });
});

export const me = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT id, name, username, role, active, created_at
       FROM users WHERE id = $1`,
    [req.user.id]
  );
  if (!rows[0]) throw new ApiError(404, "Usuario nao encontrado.");
  res.json(rows[0]);
});
