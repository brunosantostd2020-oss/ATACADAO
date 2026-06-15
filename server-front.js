import http from "node:http";
import express from "express";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createApiRouter, applyBaseMiddleware, errorHandler } from "./server/src/index.js";
import { runBootstrap } from "./server/src/bootstrap.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = join(__dirname, "dist", "client");
const PORT = parseInt(process.env.PORT ?? "8080", 10);

const MIME = {
  ".js":   "text/javascript; charset=utf-8",
  ".mjs":  "text/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".webp": "image/webp",
  ".ico":  "image/x-icon",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
  ".ttf":  "font/ttf",
  ".map":  "application/json; charset=utf-8",
};

// --- API (Express) ---
const apiApp = express();
applyBaseMiddleware(apiApp);
apiApp.use(createApiRouter());
apiApp.use((_req, res) => res.status(404).json({ error: "Rota nao encontrada." }));
apiApp.use(errorHandler);

// --- SSR do site ---
const { default: ssr } = await import("./dist/server/server.js");

function toWebRequest(req) {
  const url = `http://${req.headers.host ?? "localhost"}${req.url}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((val) => headers.append(k, val));
    else if (v != null) headers.set(k, v);
  }
  const method = req.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD";
  return new Request(url, {
    method, headers,
    body: hasBody ? req : undefined,
    duplex: hasBody ? "half" : undefined,
  });
}

async function tryStatic(req, res) {
  const rawPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (rawPath === "/") return false;
  const safePath = normalize(rawPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(CLIENT_DIR, safePath);
  if (!filePath.startsWith(CLIENT_DIR)) return false;
  try {
    const s = await stat(filePath);
    if (!s.isFile()) return false;
    const data = await readFile(filePath);
    const type = MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream";
    res.writeHead(200, {
      "content-type": type,
      "cache-control": "public, max-age=31536000, immutable",
    });
    res.end(data);
    return true;
  } catch { return false; }
}

// --- Servidor HTTP ---
const server = http.createServer(async (req, res) => {
  try {
    const path = (req.url ?? "/").split("?")[0];
    if (path === "/health" || path.startsWith("/api/")) return apiApp(req, res);
    if (await tryStatic(req, res)) return;
    const webReq = toWebRequest(req);
    const webRes = await ssr.fetch(webReq, {}, {});
    res.statusCode = webRes.status;
    webRes.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(webRes.body ? Buffer.from(await webRes.arrayBuffer()) : undefined);
  } catch (err) {
    console.error("[combined] erro:", err.message);
    res.statusCode = 500;
    res.end("<h1>Erro interno</h1>");
  }
});

// IMPORTANTE: sobe o servidor PRIMEIRO (healthcheck passa imediatamente),
// e roda o bootstrap do banco em paralelo logo depois.
server.listen(PORT, "0.0.0.0", () => {
  console.log(`[combined] Servidor na porta ${PORT}`);
  // Bootstrap em background — nao bloqueia o healthcheck
  runBootstrap()
    .then(() => console.log("[combined] Banco pronto."))
    .catch((err) => console.error("[combined] Bootstrap falhou:", err.message));
});
