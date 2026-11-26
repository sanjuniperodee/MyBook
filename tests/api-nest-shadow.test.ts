import { afterEach, describe, expect, it, vi } from "vitest";
import { diffPaths, maskPath, withShadow } from "../apps/api/src/shadow";

const BACKEND = "http://127.0.0.1:3046";
const REVIEW = "/api/v1/orders/33333333-3333-4333-8333-333333333333/review";
const json = (body: unknown, status = 200) => Response.json(body, { status });

/** Nest глазами mybook-api: список адресов и ответы на повтор GET. */
function fakeNest(answer: (path: string) => Response) {
  const calls: { url: string; headers: Headers }[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (url === `${BACKEND}/api/v1/__nest/routes`) {
      return json({
        routes: [
          { method: "GET", path: "/api/v1/orders/:orderId/review" },
          { method: "PUT", path: "/api/v1/orders/:orderId/review" },
          { method: "GET", path: "/api/v1/analytics/:x" },
          { method: "GET", path: "/api/v1/crm/orders/:id/delivery" },
          { method: "GET", path: "/api/v1/me/profile" },
          { method: "GET", path: "/api/v1/books/:id/file" },
        ],
      });
    }
    calls.push({ url, headers: new Headers(init?.headers) });
    return answer(new URL(url).pathname);
  });
  return calls;
}

const shadowed = (inner: (req: Request) => Promise<Response>, log: string[], rate = 1, random = () => 0) =>
  withShadow(inner, { enabled: true, rate, backendUrl: BACKEND, summaryMs: 0, refreshMs: 0, log: (l) => log.push(l), random });

const flush = () => new Promise((r) => setTimeout(r, 0));
const get = (path: string, headers: Record<string, string> = {}) => new Request(`https://api.mybooks.kz${path}`, { headers });

afterEach(() => vi.unstubAllGlobals());

describe("теневая сверка mybook-api ↔ Nest (ADR 0014)", () => {
  it("выключена — обработчик тот же, Nest не зовётся", () => {
    const inner = async () => json({});
    expect(withShadow(inner, { enabled: false, rate: 1, backendUrl: BACKEND })).toBe(inner);
    expect(withShadow(inner, { enabled: true, rate: 0, backendUrl: BACKEND })).toBe(inner);
  });

  it("одинаковые ответы — без строк в журнале; заголовки клиента уходят в Nest, ответ клиенту — свой", async () => {
    const calls = fakeNest(() => json({ canReview: true, labels: { order: "№1" } }));
    const log: string[] = [];
    const handle = shadowed(async () => json({ labels: { order: "№1" }, canReview: true }), log);
    await flush();
    const res = await handle(get(REVIEW, { authorization: "Bearer abcdefghijklmnopqrstuvwxyz", "x-mb-locale": "kk" }));
    expect(await res.json()).toEqual({ labels: { order: "№1" }, canReview: true });
    await vi.waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const last = calls.at(-1)!;
    expect(last.url).toBe(`${BACKEND}${REVIEW}`);
    expect(last.headers.get("authorization")).toBe("Bearer abcdefghijklmnopqrstuvwxyz");
    expect(last.headers.get("x-mb-locale")).toBe("kk");
    expect(last.headers.get("host")).toBeNull();
    await flush();
    expect(log).toEqual([]);
  });

  it("расхождение — путь с маской и пути полей, без значений", async () => {
    fakeNest(() => json({ canReview: true, review: { status: "published", text: "секрет клиента" } }));
    const log: string[] = [];
    const handle = shadowed(async () => json({ canReview: true, review: { status: "new", text: "секрет клиента" } }), log);
    await flush();
    await handle(get(REVIEW));
    await vi.waitFor(() => expect(log.length).toBeGreaterThan(0));
    expect(log[0]).toBe("[shadow] ✗ GET /api/v1/orders/:id/review 200/200 Δ review.status");
    expect(log.join("\n")).not.toContain("секрет");
    expect(log.join("\n")).not.toContain("published");
  });

  it("разный статус — в журнал", async () => {
    fakeNest(() => json({ error: "x", code: "server" }, 500));
    const log: string[] = [];
    const handle = shadowed(async () => json({ ok: 1 }), log);
    await flush();
    await handle(get(REVIEW));
    await vi.waitFor(() => expect(log[0]).toContain("Δ status 200/500"));
  });

  it("304 Not Modified сверяется без разбора JSON", async () => {
    const calls = fakeNest(() => new Response(null, { status: 304 }));
    const log: string[] = [];
    const handle = shadowed(async () => new Response(null, { status: 304 }), log);
    await flush();
    const res = await handle(get(REVIEW, { "if-none-match": '"tag"' }));
    expect(res.status).toBe(304);
    await vi.waitFor(() => expect(calls.length).toBeGreaterThan(0));
    await flush();
    expect(log).toEqual([]);
  });

  it("не сверяются: не GET, адреса не на Nest, тяжёлые отчёты, не JSON, вне доли выборки; но delivery и profile сверяются", async () => {
    const calls = fakeNest(() => json({}));
    const log: string[] = [];
    const handle = shadowed(async (req) => (new URL(req.url).pathname.endsWith("/file") ? new Response("bin") : json({})), log);
    await flush();
    await handle(new Request(`https://api.mybooks.kz${REVIEW}`, { method: "PUT", body: "{}" }));
    await handle(get("/api/v1/books"));
    await handle(get("/api/v1/analytics/sales"));
    await handle(get("/api/v1/books/33333333-3333-4333-8333-333333333333/file"));
    const sampled = shadowed(async () => json({}), log, 0.25, () => 0.9);
    await flush();
    await sampled(get(REVIEW));
    await flush();
    expect(calls).toEqual([]);

    await handle(get("/api/v1/crm/orders/123/delivery"));
    await handle(get("/api/v1/me/profile"));
    await vi.waitFor(() => expect(calls).toHaveLength(2));
  });

  it("маска пути и пути различий", () => {
    expect(maskPath("/api/v1/books/33333333-3333-4333-8333-333333333333/pages/12/x")).toBe("/api/v1/books/:id/pages/:n/x");
    expect(maskPath("/api/v1/pay/AbCdEfGhIjKlMnOpQrStUv")).toBe("/api/v1/pay/:token");
    expect(diffPaths({ a: 1, b: { c: [1, 2] } }, { a: 1, b: { c: [1] } })).toEqual(["b.c.length"]);
    expect(diffPaths({ a: 1 }, { a: 1 })).toEqual([]);
    expect(diffPaths({ a: 1, x: 2 }, { a: 2 })).toEqual(["a", "x"]);
  });
});
