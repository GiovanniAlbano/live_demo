import { createServer as createHttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
const productsFile = fileURLToPath(new URL("./products.json", import.meta.url));

/** Loads and validates the product catalog from disk. */
async function loadProducts() {
  const contents = await readFile(productsFile, "utf8");
  const products = JSON.parse(contents.replace(/^\uFEFF/, ""));

  if (!Array.isArray(products)) {
    throw new Error("Invalid catalog");
  }

  return products;
}

/** Creates the local API server. */
export function createServer() {
  return createHttpServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Vary", "Origin");

    const origin = request.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      response.setHeader("Access-Control-Allow-Origin", origin);
    }

    if (request.method === "OPTIONS") {
      if (!origin || !allowedOrigins.has(origin)) {
        response.writeHead(403).end();
        return;
      }

      response.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
      response.writeHead(204).end();
      return;
    }

    const method = request.method ?? "GET";
    if (method !== "GET" && method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD, OPTIONS");
      response.writeHead(405, {
        "Content-Type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname === "/health") {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(method === "HEAD" ? undefined : JSON.stringify({ status: "ok" }));
      return;
    }

    if (pathname === "/products") {
      try {
        const products = await loadProducts();
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(method === "HEAD" ? undefined : JSON.stringify(products));
      } catch {
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Unable to load product catalog" }));
      }
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Not found" }));
  });
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entryPoint) {
  const port = Number(process.env.BACKEND_PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new RangeError("BACKEND_PORT must be an integer between 1 and 65535");
  }

  const server = createServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`Backend listening at http://127.0.0.1:${port}`);
  });
}