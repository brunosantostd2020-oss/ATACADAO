// Servidor de producao do front-end para o Railway.
// O build do TanStack Start gera um handler no padrao Web (fetch);
// aqui o adaptamos para um servidor HTTP do Node, servindo tambem os
// arquivos estaticos do cliente (dist/client). Escuta na porta do
// Railway (process.env.PORT).

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

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

// Carrega o handler SSR do build
const { default: ssr } = await import("./dist/server/server.js");

// Converte IncomingMessage (Node) -> Request (Web)
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

// Tenta servir um arquivo estatico do client. Retorna true se serviu.
async function tryStatic(req, res) {
  // remove querystring e normaliza para evitar path traversal
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
    // 1) arquivos estaticos (JS, CSS, imagens...)
    if (await tryStatic(req, res)) return;

    // 2) SSR (renderiza as paginas)
    const webReq = toWebRequest(req);
    const webRes = await ssr.fetch(webReq, {}, {});

    res.statusCode = webRes.status;
    webRes.headers.forEach((value, key) => res.setHeader(key, value));
    if (webRes.body) {
      const buf = Buffer.from(await webRes.arrayBuffer());
      res.end(buf);
    } else {
      res.end();
    }
  } catch (err) {
    console.error("[front-server] erro:", err);
    res.statusCode = 500;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end("<h1>Erro ao carregar a pagina</h1>");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[front-server] Site rodando na porta ${PORT}`);
});
