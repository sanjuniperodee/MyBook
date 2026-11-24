/**
 * Адаптер node:http ↔ Fetch API: запрос Node → Request, Response → ответ Node (тело потоком). Каждый запрос выполняется
 * в своём контексте (context.ts), задачи after — после отправки ответа. Без фреймворка: маршрутов немного, а
 * лишний слой — память и задержка (ADR 0012).
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { requestContext, type RequestContext } from "./context";

function toRequest(req: IncomingMessage): Request {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    for (const one of Array.isArray(v) ? v : [v]) headers.append(k, one);
  }
  const proto = headers.get("x-forwarded-proto") ?? "http";
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "127.0.0.1";
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(`${proto}://${host}${req.url ?? "/"}`, {
    method: req.method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    // @ts-expect-error duplex обязателен для потокового тела в Node, в типах lib.dom его нет
    duplex: hasBody ? "half" : undefined,
  });
}

async function send(res: ServerResponse, response: Response) {
  res.statusCode = response.status;
  for (const [k, v] of response.headers) res.appendHeader(k, v);
  if (!response.body) return void res.end();
  for await (const chunk of response.body) res.write(chunk);
  res.end();
}

export function serve(handle: (req: Request) => Promise<Response>, opts: { port: number; host: string }) {
  const server = createServer((req, res) => {
    const ctx: RequestContext = { request: toRequest(req), afterResponse: [] };
    void requestContext.run(ctx, async () => {
      try {
        await send(res, await handle(ctx.request));
      } catch (err) {
        console.error("[api]", err);
        if (!res.headersSent) res.statusCode = 500;
        res.end();
      }
      for (const task of ctx.afterResponse) Promise.resolve().then(task).catch((err) => console.error("[api] after", err));
    });
  });
  // Keep-alive дольше, чем у nginx (60 с): соединение закрывает прокси, а не сервис посреди запроса.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.listen(opts.port, opts.host);
  return server;
}
