// Servidor COMBINADO de producao (Railway): roda a API e o site no mesmo
// processo e na mesma porta. As rotas /api/* e /health vao para o back-end
// (Express); todo o resto serve os arquivos do site e a renderizacao SSR.
// Assim nao e preciso configurar VITE_API_URL nem lidar com CORS.

import http from "node:http";
import express from "express";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// --- Back-end (API) ---
import { createApiRouter, applyBaseMiddleware, errorHandler } from "./server/src/index.js";
import { runBootstrap } from "./server/src/bootstrap.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = join(__dirname, "dist", "client");
const PORT = parseInt(process.env.PORT ?? "8080", 10);

const MIME = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

// 1) Prepara o banco (schema + login padrao). Nao derruba o site se falhar.
try {
  await runBootstrap();
} catch (err) {
  console.error("[combined] Bootstrap do banco falhou (a API pode nao funcionar):", err.message);
}

// 2) Monta a API como um app Express
const apiApp = express();
applyBaseMiddleware(apiApp);
apiApp.use(createApiRouter());
apiApp.use((_req, res) => res.status(404).json({ error: "Rota nao encontrada." }));
apiApp.use(errorHandler);

// 3) Carrega o handler SSR do site
const { default: ssr } = await import("./dist/server/server.js");

// IncomingMessage (Node) -> Request (Web)
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
    method,
    headers,
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
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const path = (req.url ?? "/").split("?")[0];

    // 1) API e healthcheck -> Express
    if (path === "/health" || path.startsWith("/api/")) {
      return apiApp(req, res);
    }

    // 2) arquivos estaticos (JS, CSS, imagens)
    if (await tryStatic(req, res)) return;

    // 3) SSR (paginas)
    const webReq = toWebRequest(req);
    const webRes = await ssr.fetch(webReq, {}, {});
    res.statusCode = webRes.status;
    webRes.headers.forEach((value, key) => res.setHeader(key, value));
    if (webRes.body) {
      res.end(Buffer.from(await webRes.arrayBuffer()));
    } else {
      res.end();
    }
  } catch (err) {
    console.error("[combined] erro:", err);
    res.statusCode = 500;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end("<h1>Erro ao carregar a pagina</h1>");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[combined] Site + API rodando na porta ${PORT}`);
});
