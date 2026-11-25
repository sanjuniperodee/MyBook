import { describe, expect, it, vi } from "vitest";
import { handleSiteRoute, siteRoutePaths } from "../apps/api/src/site-routes";

// Мокаем сессию и i18n, чтобы проверять эквивалентность Next route handlers и mybook-api без подключения к БД.
vi.mock("@/server/auth", () => ({
  getCurrentUser: async () => null,
  sessionToken: async () => null,
  isStaff: () => false,
}));
vi.mock("@/i18n/server", async () => ({
  getMessages: async () => ({ api: (await import("@/i18n/messages/ru/api")).api }),
  getLocale: async () => "ru",
}));

const ID1 = "11111111-2222-4333-8444-555555555555";
const ID2 = "22222222-3333-4444-8555-666666666666";

describe("API v1 A5: маршруты сайта в mybook-api (site-routes.ts)", () => {
  it("содержит новую порцию JSON-маршрутов редактора и CRM, а статические пути стоят раньше параметрических", () => {
    const idx = (p: string) => siteRoutePaths.indexOf(p);
    for (const p of [
      "/api/books/{id}",
      "/api/books/{id}/chapters",
      "/api/books/{id}/chapters/order",
      "/api/books/{id}/chapters/move",
      "/api/books/{id}/chapters/{key}",
      "/api/books/{id}/questions",
      "/api/books/{id}/questions/order",
      "/api/books/{id}/questions/{qid}/move",
      "/api/books/{id}/questions/{qid}",
      "/api/books/{id}/photos/order",
      "/api/books/{id}/photos/batch",
      "/api/books/{id}/photos/{pid}",
      "/api/books/{id}/layout",
      "/api/books/{id}/letters/invite",
      "/api/books/{id}/letters/order",
      "/api/books/{id}/letters/{lid}",
      "/api/admin/chats/{id}/messages",
      "/api/admin/notifications",
    ]) {
      expect(idx(p), p).toBeGreaterThanOrEqual(0);
    }
    expect(idx("/api/books/{id}/chapters/order")).toBeLessThan(idx("/api/books/{id}/chapters/{key}"));
    expect(idx("/api/books/{id}/chapters/move")).toBeLessThan(idx("/api/books/{id}/chapters/{key}"));
    expect(idx("/api/books/{id}/questions/order")).toBeLessThan(idx("/api/books/{id}/questions/{qid}"));
    expect(idx("/api/books/{id}/photos/order")).toBeLessThan(idx("/api/books/{id}/photos/{pid}"));
    expect(idx("/api/books/{id}/photos/batch")).toBeLessThan(idx("/api/books/{id}/photos/{pid}"));
    expect(idx("/api/books/{id}/letters/invite")).toBeLessThan(idx("/api/books/{id}/letters/{lid}"));
    expect(idx("/api/books/{id}/letters/order")).toBeLessThan(idx("/api/books/{id}/letters/{lid}"));
  });

  it("чужой путь возвращает null, неподдерживаемый метод — 405 со списком Allow", async () => {
    expect(await handleSiteRoute(new Request("http://127.0.0.1:3044/api/unknown-route"))).toBeNull();

    const res405 = await handleSiteRoute(new Request(`http://127.0.0.1:3044/api/books/${ID1}/chapters/order`, { method: "GET" }));
    expect(res405?.status).toBe(405);
    expect(res405?.headers.get("allow")).toBe("PUT");

    const notif405 = await handleSiteRoute(new Request("http://127.0.0.1:3044/api/admin/notifications", { method: "DELETE" }));
    expect(notif405?.status).toBe(405);
    expect(notif405?.headers.get("allow")).toBe("POST");
  });

  it("статические подмаршруты (/order, /move, /batch, /invite) не перехватываются параметрическими ({key}, {pid}, {lid})", async () => {
    // chapters/order принимает PUT, а chapters/[key] принимает PATCH/DELETE -> PUT обязан попасть в chapters/order, а не в 405!
    const chapOrder = await handleSiteRoute(new Request(`http://127.0.0.1:3044/api/books/${ID1}/chapters/order`, { method: "PUT", body: "{}" }));
    expect(chapOrder?.status).toBe(401);

    // chapters/move принимает PUT, а chapters/[key] — PATCH/DELETE
    const chapMove = await handleSiteRoute(new Request(`http://127.0.0.1:3044/api/books/${ID1}/chapters/move`, { method: "PUT", body: "{}" }));
    expect(chapMove?.status).toBe(401);

    // photos/order принимает PUT, photos/batch — POST, а photos/[pid] — PATCH/DELETE
    const phOrder = await handleSiteRoute(new Request(`http://127.0.0.1:3044/api/books/${ID1}/photos/order`, { method: "PUT", body: "{}" }));
    expect(phOrder?.status).toBe(401);
    const phBatch = await handleSiteRoute(new Request(`http://127.0.0.1:3044/api/books/${ID1}/photos/batch`, { method: "POST", body: "{}" }));
    expect(phBatch?.status).toBe(401);

    // letters/invite принимает POST, letters/order — PUT, а letters/[lid] — PATCH/DELETE
    const letInvite = await handleSiteRoute(new Request(`http://127.0.0.1:3044/api/books/${ID1}/letters/invite`, { method: "POST", body: "{}" }));
    expect(letInvite?.status).toBe(401);
    const letOrder = await handleSiteRoute(new Request(`http://127.0.0.1:3044/api/books/${ID1}/letters/order`, { method: "PUT", body: "{}" }));
    expect(letOrder?.status).toBe(401);
  });

  it("эквивалентность 1-в-1: ответы handleSiteRoute совпадают с прямым вызовом Next route handlers", async () => {
    const cases = [
      {
        name: "PATCH /api/books/{id}",
        req: () => new Request(`http://127.0.0.1:3044/api/books/${ID1}`, { method: "PATCH", body: "{}" }),
        direct: async (r: Request) => (await import("@/app/api/books/[id]/route")).PATCH(r, { params: Promise.resolve({ id: ID1 }) }),
      },
      {
        name: "POST /api/books/{id}/chapters",
        req: () => new Request(`http://127.0.0.1:3044/api/books/${ID1}/chapters`, { method: "POST", body: "{}" }),
        direct: async (r: Request) => (await import("@/app/api/books/[id]/chapters/route")).POST(r, { params: Promise.resolve({ id: ID1 }) }),
      },
      {
        name: "PATCH /api/books/{id}/chapters/{key}",
        req: () => new Request(`http://127.0.0.1:3044/api/books/${ID1}/chapters/${ID2}`, { method: "PATCH", body: "{}" }),
        direct: async (r: Request) => (await import("@/app/api/books/[id]/chapters/[key]/route")).PATCH(r, { params: Promise.resolve({ id: ID1, key: ID2 }) }),
      },
      {
        name: "POST /api/books/{id}/questions/{qid}/move",
        req: () => new Request(`http://127.0.0.1:3044/api/books/${ID1}/questions/${ID2}/move`, { method: "POST", body: "{}" }),
        direct: async (r: Request) => (await import("@/app/api/books/[id]/questions/[qid]/move/route")).POST(r, { params: Promise.resolve({ id: ID1, qid: ID2 }) }),
      },
      {
        name: "PATCH /api/books/{id}/photos/{pid}",
        req: () => new Request(`http://127.0.0.1:3044/api/books/${ID1}/photos/${ID2}`, { method: "PATCH", body: "{}" }),
        direct: async (r: Request) => (await import("@/app/api/books/[id]/photos/[pid]/route")).PATCH(r, { params: Promise.resolve({ id: ID1, pid: ID2 }) }),
      },
      {
        name: "POST /api/books/{id}/layout",
        req: () => new Request(`http://127.0.0.1:3044/api/books/${ID1}/layout`, { method: "POST", body: "{}" }),
        direct: async (r: Request) => (await import("@/app/api/books/[id]/layout/route")).POST(r, { params: Promise.resolve({ id: ID1 }) }),
      },
      {
        name: "PATCH /api/books/{id}/letters/{lid}",
        req: () => new Request(`http://127.0.0.1:3044/api/books/${ID1}/letters/${ID2}`, { method: "PATCH", body: "{}" }),
        direct: async (r: Request) => (await import("@/app/api/books/[id]/letters/[lid]/route")).PATCH(r, { params: Promise.resolve({ id: ID1, lid: ID2 }) }),
      },
      {
        name: "GET /api/admin/chats/{id}/messages",
        req: () => new Request(`http://127.0.0.1:3044/api/admin/chats/${ID1}/messages`, { method: "GET" }),
        direct: async (r: Request) => (await import("@/app/api/admin/chats/[id]/messages/route")).GET(r, { params: Promise.resolve({ id: ID1 }) }),
      },
      {
        name: "POST /api/admin/notifications",
        req: () => new Request("http://127.0.0.1:3044/api/admin/notifications", { method: "POST", body: "{}" }),
        direct: async (r: Request) => (await import("@/app/api/admin/notifications/route")).POST(r, undefined as never),
      },
    ];

    for (const c of cases) {
      const viaApi = await handleSiteRoute(c.req());
      const direct = await c.direct(c.req());
      expect(viaApi, c.name).not.toBeNull();
      expect(viaApi!.status, c.name).toBe(direct.status);
      expect(await viaApi!.json(), c.name).toEqual(await direct.json());
    }
  });
});
