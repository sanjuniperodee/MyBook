import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { StaffContext } from "@/modules/access/domain/StaffContext";
import { isPhoneEmail } from "@/modules/identity";
import { allPermissions, type Permission } from "@/shared/domain/permissions";
import { STAFF_ACCESS, type StaffAccessPort } from "../src/core/auth/staff";
import { SITE_OPS_PORTS } from "../src/modules/site-ops/site-ops.tokens";
import { bootTestApp, sessionOf, testUser } from "./app";

/**
 * Контекст 7B: последние 32 маршрута сайта (деньги, вебхуки, звонки, файлы заказа) Nest выполняет тем же
 * обработчиком сайта, что и mybook-api, — через мост site-ops.bridge.ts. Обработчики здесь подменены «эхом»: ответ —
 * то, что обработчик увидел (метод, адрес, параметры, заголовки, тело, кто вошёл, сотрудник с правилами, токен, IP,
 * язык). Совпадение байт в байт значит, что мост передаёт запрос и вход без потерь — тело для подписей вебхуков тоже.
 */
const OWNER = testUser("11111111-1111-4111-8111-111111111111", { name: "Айгерим", email: "owner@mybooks.kz", role: "admin" });
const SALES = testUser("22222222-2222-4222-8222-222222222222", { name: "Данияр", email: "sales@mybooks.kz", role: "admin" });
const NO_2FA = testUser("33333333-3333-4333-8333-333333333333", { name: "Без 2FA", email: "no2fa@mybooks.kz", role: "admin" });
const CLIENT = testUser("88888888-8888-4888-8888-888888888888", { name: "Асель", email: "asel@example.kz", role: "user" });
const ALL_USERS = [OWNER, SALES, NO_2FA, CLIENT];

const makeCtx = (id: string, roleName: string, scope: "all" | "own", perms: readonly Permission[], isOwner = false) =>
  new StaffContext(id, roleName, isOwner ? "owner" : null, scope, new Set(perms), isOwner, { isPhoneEmail });

/** Роль и правило безопасности сотрудника — одинаково для Nest (STAFF_ACCESS) и mybook-api (getStaff вне моста). */
function resolveStaffSync(user: { id: string; role: string; staffDisabled?: boolean | null }) {
  if (user.role !== "admin" || user.staffDisabled) return null;
  if (user.id === OWNER.id) return { context: makeCtx(user.id, "Руководитель", "all", allPermissions, true), gate: null };
  if (user.id === SALES.id) return { context: makeCtx(user.id, "Менеджер", "own", ["orders.view", "calls.make"]), gate: null };
  if (user.id === NO_2FA.id) return { context: makeCtx(user.id, "Менеджер", "all", ["orders.view"]), gate: "2fa" as const };
  return null;
}

const staffAccess: StaffAccessPort = { resolve: async (user) => resolveStaffSync(user) };

const shared = vi.hoisted(() => ({ users: [] as { id: string }[], tokenOf: null as unknown as (u: { id: string }) => string }));

/** Эхо-обработчик маршрута сайта: всё, что он увидел, — JSON-ответом. */
async function echo(req: Request, ctx?: { params?: Promise<Record<string, string>> }): Promise<Response> {
  const [{ getCurrentUser, sessionToken }, { getStaff }, { trustedClientIp }, { getLocale }] = await Promise.all([
    import("@/server/auth"),
    import("@/server/access"),
    import("@/server/rateLimit"),
    import("@/i18n/server"),
  ]);
  const url = new URL(req.url);
  const type = req.headers.get("content-type")?.split(";")[0] ?? null;
  let body: unknown = null;
  if (req.method !== "GET" && req.method !== "HEAD") {
    if (type === "multipart/form-data") {
      // Граница multipart у Nest своя (форма собирается заново) — сверяем поля и файлы, а не байты.
      const form = await req.formData();
      body = [...form.entries()].map(([k, v]) => (typeof v === "string" ? [k, v] : [k, v.name, v.type, v.size]));
    } else body = Buffer.from(await req.arrayBuffer()).toString("base64");
  }
  const staff = await getStaff();
  return Response.json(
    {
      method: req.method,
      path: url.pathname,
      search: url.search,
      params: (await ctx?.params) ?? null,
      type,
      signature: req.headers.get("x-signature") ?? req.headers.get("content-hmac") ?? null,
      body,
      user: (await getCurrentUser())?.id ?? null,
      staff: staff ? { id: staff.user.id, perms: [...staff.permissions].sort() } : null,
      token: (await sessionToken()) !== null,
      ip: await trustedClientIp(),
      locale: await getLocale(),
    },
    { status: 207, headers: { "x-echo": "1", "cache-control": "no-store" } },
  );
}

/** Модуль обработчика с эхо вместо его методов — только тех, что он объявляет (405 решает реестр по ним). */
function echoModule(actual: Record<string, unknown>) {
  // Отсутствующие методы — явно undefined: заглушка vitest бросает на чтение неизвестного экспорта, а реестру нужно «нет».
  return Object.fromEntries(["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => [m, typeof actual[m] === "function" ? echo : undefined]));
}

vi.mock("@/server/site-handlers/admin/calls-id-recording", async (orig) => echoModule(await orig()));
vi.mock("@/server/site-handlers/admin/calls-whatsapp-audio-auth", async (orig) => echoModule(await orig()));
vi.mock("@/server/site-handlers/admin/calls-whatsapp-id", async (orig) => echoModule(await orig()));
vi.mock("@/server/site-handlers/admin/calls-whatsapp-id-recording", async (orig) => echoModule(await orig()));
vi.mock("@/server/site-handlers/admin/calls-whatsapp-listen-auth", async (orig) => echoModule(await orig()));
vi.mock("@/server/site-handlers/admin/calls-whatsapp-live", async (orig) => echoModule(await orig()));
vi.mock("@/server/site-handlers/admin/deals-id-payments", async (orig) => echoModule(await orig()));
vi.mock("@/server/site-handlers/admin/deals-id-receipts", async (orig) => echoModule(await orig()));
vi.mock("@/server/site-handlers/admin/gifts-id-receipt", async (orig) => echoModule(await orig()));
vi.mock("@/server/site-handlers/admin/order-payments-id-receipt", async (orig) => echoModule(await orig()));
vi.mock("@/server/site-handlers/admin/orders-id-payments", async (orig) => echoModule(await orig()));
vi.mock("@/server/site-handlers/admin/orders-id-refunds", async (orig) => echoModule(await orig()));
vi.mock("@/server/site-handlers/admin/payments-id", async (orig) => echoModule(await orig()));
vi.mock("@/server/site-handlers/admin/receipts-id", async (orig) => echoModule(await orig()));
vi.mock("@/server/site-handlers/admin/webphone", async (orig) => echoModule(await orig()));
vi.mock("@/server/site-handlers/integrations/email", async (orig) => echoModule(await orig()));
vi.mock("@/server/site-handlers/integrations/google-callback", async (orig) => echoModule(await orig()));
vi.mock("@/server/site-handlers/integrations/google-connect", async (orig) => echoModule(await orig()));
vi.mock("@/server/site-handlers/integrations/google-webhook", async (orig) => echoModule(await orig()));
vi.mock("@/server/site-handlers/integrations/gowa", async (orig) => echoModule(await orig()));
vi.mock("@/server/site-handlers/integrations/pbx", async (orig) => echoModule(await orig()));
vi.mock("@/server/site-handlers/integrations/wazzup", async (orig) => echoModule(await orig()));
vi.mock("@/server/site-handlers/integrations/zadarma", async (orig) => echoModule(await orig()));
vi.mock("@/server/site-handlers/orders/file", async (orig) => echoModule(await orig()));
vi.mock("@/server/site-handlers/orders/render-progress", async (orig) => echoModule(await orig()));
vi.mock("@/server/site-handlers/payments/cloudpayments-webhook", async (orig) => echoModule(await orig()));
vi.mock("@/server/site-handlers/payments/kaspi-invoice-item", async (orig) => echoModule(await orig()));
vi.mock("@/server/site-handlers/payments/kaspi-invoices", async (orig) => echoModule(await orig()));
vi.mock("@/server/site-handlers/payments/kaspi-webhook", async (orig) => echoModule(await orig()));

vi.mock("next/headers", () => import("@/server/http/next-shim"));
vi.mock("next/server", () => import("@/server/http/next-shim"));
vi.mock("next/navigation", () => import("@/server/http/next-shim"));
vi.mock("@/server/auth", async (orig) => {
  const actual = await orig<typeof import("@/server/auth")>();
  const { legacyRequestContext } = await import("@/server/request-context");
  return {
    ...actual,
    // В мосте — пользователь из контекста (как настоящий getCurrentUser); у mybook-api — по токену сессии.
    getCurrentUser: async () => {
      if (legacyRequestContext()) return actual.getCurrentUser();
      const token = await actual.sessionToken();
      return token ? (shared.users.find((u) => shared.tokenOf(u) === token) ?? null) : null;
    },
  };
});
vi.mock("@/server/access", async (orig) => {
  const actual = await orig<typeof import("@/server/access")>();
  const { legacyRequestContext } = await import("@/server/request-context");
  const { getCurrentUser } = await import("@/server/auth");
  return {
    ...actual,
    // В мосте — настоящий getStaff (сотрудник и правило IP/2FA из контекста); у mybook-api — та же роль без базы.
    getStaff: async () => {
      if (legacyRequestContext()) return actual.getStaff();
      const u = await getCurrentUser();
      const r = u ? resolveStaffSync(u) : null;
      if (!u || !r || r.gate) return null;
      const c = r.context;
      return { user: u, roleName: c.roleName, roleKey: c.roleKey, scope: c.scope, permissions: c.permissions, isOwner: c.isOwner, context: c };
    },
  };
});

shared.users = ALL_USERS;
shared.tokenOf = (u) => sessionOf(u as typeof OWNER);

const { assertRoute } = await import("./expected");
const { legacySiteOpsPorts } = await import("../src/legacy/site-ops.ports");

/** Все 32 маршрута контекста 7B — как в адаптере legacy/site-ops.ports.ts и реестре сайта. */
const ROUTES = [
  "POST /api/payments/kaspi/webhook",
  "POST /api/payments/kaspi/invoices",
  "GET /api/payments/kaspi/invoices/{id}",
  "DELETE /api/payments/kaspi/invoices/{id}",
  "POST /api/payments/cloudpayments/{event}",
  "GET /api/orders/{id}/files/{kind}",
  "GET /api/orders/{id}/render-progress",
  "POST /api/admin/deals/{id}/payments",
  "POST /api/admin/deals/{id}/receipts",
  "GET /api/admin/gifts/{id}/receipt",
  "POST /api/admin/gifts/{id}/receipt",
  "GET /api/admin/order-payments/{id}/receipt",
  "POST /api/admin/orders/{id}/payments",
  "POST /api/admin/orders/{id}/refunds",
  "DELETE /api/admin/payments/{id}",
  "GET /api/admin/receipts/{id}",
  "POST /api/integrations/email",
  "GET /api/integrations/google/callback",
  "GET /api/integrations/google/connect",
  "POST /api/integrations/google/webhook",
  "POST /api/integrations/gowa",
  "POST /api/integrations/pbx",
  "POST /api/integrations/wazzup",
  "GET /api/integrations/zadarma",
  "POST /api/integrations/zadarma",
  "GET /api/admin/calls/whatsapp/audio-auth",
  "GET /api/admin/calls/whatsapp/listen-auth",
  "GET /api/admin/calls/whatsapp/live",
  "POST /api/admin/calls/whatsapp/{id}",
  "POST /api/admin/calls/whatsapp/{id}/recording",
  "GET /api/admin/calls/{id}/recording",
  "GET /api/admin/webphone",
] as const;

const ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const fill = (path: string) => path.replace("{event}", "pay").replace("{kind}", "block").replace(/\{id\}/g, ID);

const asOwner = { cookie: `mb_session=${sessionOf(OWNER)}` };
const asSales = { cookie: `mb_session=${sessionOf(SALES)}` };
const asNo2fa = { cookie: `mb_session=${sessionOf(NO_2FA)}` };
const asClient = { cookie: `mb_session=${sessionOf(CLIENT)}` };
const asBearer = { authorization: `Bearer ${sessionOf(CLIENT)}` };

let app: NestFastifyApplication;

beforeAll(async () => {
  const ports = (legacySiteOpsPorts as { useFactory: () => unknown }).useFactory();
  ({ app } = await bootTestApp({ users: ALL_USERS, overrides: [[STAFF_ACCESS, staffAccess], [SITE_OPS_PORTS, ports]] }));
});

afterAll(() => app.close());

async function each(fn: (method: string, path: string) => Promise<unknown>) {
  const failed: string[] = [];
  for (const r of ROUTES) {
    const [method, path] = r.split(" ") as [string, string];
    try {
      await fn(method, fill(path));
    } catch (err) {
      failed.push(`${r}: ${String(err instanceof Error ? err.message : err).split("\n")[0]}`);
    }
  }
  return failed;
}

const jsonBody = { event: "payment", amount: 29000, note: "Оплата — «Kaspi»" };

describe("ответы Nest байт в байт (эталон — прежний mybook-api): Контекст 7B — 32 маршрута сайта через мост к обработчикам сайта", () => {
  it("маршрутов 32, без повторов", () => {
    expect(ROUTES).toHaveLength(32);
    expect(new Set(ROUTES).size).toBe(32);
  });

  for (const [who, headers] of [
    ["без входа", {}],
    ["клиент (cookie)", asClient],
    ["клиент (Bearer, приложение)", asBearer],
    ["руководитель", asOwner],
    ["менеджер «только свои»", asSales],
    ["сотрудник без обязательной 2FA (getStaff → null)", asNo2fa],
  ] as const) {
    it(`${who}: каждый маршрут видит тот же запрос и вход`, async () => {
      const failed = await each((method, url) =>
        assertRoute({
          nest: app,
          method: method as "GET",
          url: method === "GET" || method === "DELETE" ? `${url}?a=1&b=${encodeURIComponent("два")}` : url,
          headers: { ...headers, "x-mybook-locale": "kk" },
          body: method === "GET" || method === "DELETE" ? undefined : jsonBody,
        }),
      );
      expect(failed).toEqual([]);
    });
  }

  it("сырые байты тела для подписей вебхуков (JSON с пробелами, form-urlencoded, text) — те же", async () => {
    const raw = '{ "event" : "payment",  "amount":29000 , "note":"Оплата"}';
    for (const url of ["/api/payments/kaspi/webhook", "/api/integrations/gowa", "/api/v1/site/payments/kaspi/webhook"]) {
      await assertRoute({ nest: app, method: "POST", url, headers: { "content-type": "application/json", "x-signature": "sig-1" }, body: raw });
    }
    const form = "Id=1&Amount=29000.00&Data=%7B%22a%22%3A1%7D&Description=%D0%9E%D0%BF%D0%BB%D0%B0%D1%82%D0%B0";
    for (const url of ["/api/payments/cloudpayments/pay", "/api/integrations/zadarma", "/api/integrations/pbx"]) {
      await assertRoute({ nest: app, method: "POST", url, headers: { "content-type": "application/x-www-form-urlencoded", "content-hmac": "hmac-1" }, body: form });
    }
    await assertRoute({ nest: app, method: "POST", url: "/api/integrations/email", headers: { "content-type": "text/plain" }, body: "From: a@b\r\n\r\nПривет" });
    await assertRoute({ nest: app, method: "GET", url: "/api/integrations/zadarma?zd_echo=abc123" });
  });

  it("multipart с файлом чека — те же поля и файл", async () => {
    const boundary = "----ParitySiteOps";
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="amount"\r\n\r\n29000\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="check.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
      Buffer.from("jpeg-bytes"),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const headers = { ...asOwner, "content-type": `multipart/form-data; boundary=${boundary}` };
    for (const url of [`/api/admin/orders/${ID}/payments`, `/api/admin/deals/${ID}/receipts`, `/api/v1/site/admin/gifts/${ID}/receipt`]) {
      await assertRoute({ nest: app, method: "POST", url, headers, body });
    }
  });
});
