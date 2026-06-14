import { ZodError } from "zod";
import { ApiError } from "../utils/asyncHandler.js";
import { isProd } from "../config/env.js";

export function notFound(_req, res) {
  res.status(404).json({ error: "Rota nao encontrada." });
}

export function errorHandler(err, _req, res, _next) {
  // Erro de validacao do Zod
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Dados invalidos.",
      details: err.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      })),
    });
  }

  // Erro de aplicacao conhecido
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  // Violacao de unicidade do Postgres
  if (err.code === "23505") {
    return res.status(409).json({ error: "Registro duplicado." });
  }

  // Erro inesperado
  console.error("[error]", err);
  res.status(500).json({
    error: "Erro interno do servidor.",
    ...(isProd ? {} : { detail: err.message }),
  });
}
