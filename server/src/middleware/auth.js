import jwt from "jsonwebtoken";
import { config } from "../config/env.js";
import { ApiError } from "../utils/asyncHandler.js";

/**
 * Exige um JWT valido no header Authorization: Bearer <token>.
 * Popula req.user = { id, role, name }.
 */
export function authenticate(req, _res, next) {
  const header = req.headers.authorization ?? "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return next(new ApiError(401, "Token de autenticacao ausente."));
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = { id: payload.sub, role: payload.role, name: payload.name };
    next();
  } catch {
    next(new ApiError(401, "Token invalido ou expirado."));
  }
}

/**
 * Restringe a rota a determinados papeis.
 * Uso: authorize("admin") ou authorize("admin", "caixa")
 */
export function authorize(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new ApiError(401, "Nao autenticado."));
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, "Voce nao tem permissao para esta acao."));
    }
    next();
  };
}
