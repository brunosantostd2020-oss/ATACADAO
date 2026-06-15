import dotenv from "dotenv";

dotenv.config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  }
  return value;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parseInt(process.env.PORT ?? "3333", 10),

  // PostgreSQL — Railway injeta DATABASE_URL automaticamente
  databaseUrl: required("DATABASE_URL"),

  // JWT
  jwtSecret: required("JWT_SECRET", "troque-este-segredo-em-producao"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "12h",

  // CORS — dominio do front (Railway/produção). Use * em dev.
  corsOrigin: process.env.CORS_ORIGIN ?? "*",

  // Credenciais do login criado no seed (login unico)
  seedAdminName: process.env.SEED_ADMIN_NAME ?? "Atacadao",
  seedAdminUser: process.env.SEED_ADMIN_USER ?? "atacadao",
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD ?? "atacadao123",
};

export const isProd = config.nodeEnv === "production";
