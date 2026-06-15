import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import { config, isProd } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import authRoutes from "./routes/auth.routes.js";
import usersRoutes from "./routes/users.routes.js";
import productsRoutes from "./routes/products.routes.js";
import comandasRoutes from "./routes/comandas.routes.js";

/**
 * Cria um Router Express com TODAS as rotas da API (/api/... e /health).
 * Usado tanto no modo standalone (este arquivo) quanto no modo combinado
 * (server-front.js serve site + API no mesmo processo).
 */
export function createApiRouter() {
  const router = express.Router();

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Muitas tentativas. Tente novamente mais tarde." },
  });

  router.get("/health", (_req, res) => res.json({ status: "ok", ts: Date.now() }));
  router.use("/api/auth/login", loginLimiter);
  router.use("/api/auth", authRoutes);
  router.use("/api/users", usersRoutes);
  router.use("/api/products", productsRoutes);
  router.use("/api/comandas", comandasRoutes);

  return router;
}

/** Aplica os middlewares base (helmet, cors, json, logs) num app. */
export function applyBaseMiddleware(app) {
  app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(","),
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(isProd ? "combined" : "dev"));
}

// Exporta o handler de erro para o modo combinado reaproveitar.
export { errorHandler };

// ---------------------------------------------------------------------
// Modo STANDALONE: roda a API sozinha (usado em dev e no bootstrap).
// So inicia o listen se este arquivo for o entrypoint.
// ---------------------------------------------------------------------
function startStandalone() {
  const app = express();
  applyBaseMiddleware(app);
  app.get("/", (_req, res) =>
    res.json({ name: "Atacadao Cervejaria API", version: "1.0.0" })
  );
  app.use(createApiRouter());
  app.use((_req, res) => res.status(404).json({ error: "Rota nao encontrada." }));
  app.use(errorHandler);
  app.listen(config.port, () => {
    console.log(`[server] API rodando na porta ${config.port} (${config.nodeEnv})`);
  });
}

// Detecta se foi chamado diretamente (node src/index.js)
const isMain = process.argv[1] && process.argv[1].endsWith("index.js");
if (isMain) startStandalone();
