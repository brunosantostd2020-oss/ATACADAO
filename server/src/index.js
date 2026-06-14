import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import { config, isProd } from "./config/env.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";
import authRoutes from "./routes/auth.routes.js";
import usersRoutes from "./routes/users.routes.js";
import productsRoutes from "./routes/products.routes.js";
import comandasRoutes from "./routes/comandas.routes.js";

const app = express();

app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(","),
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(morgan(isProd ? "combined" : "dev"));

// Rate limit no login para evitar brute force
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Tente novamente mais tarde." },
});

// Healthcheck (Railway)
app.get("/health", (_req, res) => res.json({ status: "ok", ts: Date.now() }));
app.get("/", (_req, res) =>
  res.json({ name: "Atacadao Cervejaria API", version: "1.0.0" })
);

// Rotas
app.use("/api/auth/login", loginLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/comandas", comandasRoutes);

// 404 + erro
app.use(notFound);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`[server] API rodando na porta ${config.port} (${config.nodeEnv})`);
});
