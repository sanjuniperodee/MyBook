import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, it, vi } from "vitest";
import { StaffContext } from "@/modules/access/domain/StaffContext";
import { isPhoneEmail } from "@/modules/identity";
import { allPermissions, type Permission } from "@/shared/domain/permissions";
import { STAFF_ACCESS, type StaffAccessPort } from "../src/core/auth/staff";
import { SITE_OPS_PORTS } from "../src/modules/site-ops/site-ops.tokens";
import { bootTestApp, sessionOf, testUser } from "./app";

/**
 * Контекст 7B с настоящими обработчиками сайта (без эха): 405 с Allow по методам модуля и ответы чека оплаты сделки —
 * вход, права, «только свои», 2FA, нет чека, сам файл — байт в байт у Nest (через мост) и mybook-api.
 *
 * (Остальное — в site-ops.parity.test.ts.) Контекст 7B: последние 32 маршрута сайта (деньги, вебхуки, звонки, файлы заказа) Nest выполняет тем же
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
  if (user.id === SALES.id) return { context: makeCtx(user.id, "Менеджер", "own", ["orders.view", "calls.make", "deals.view"]), gate: null };
  if (user.id === NO_2FA.id) return { context: makeCtx(user.id, "Менеджер", "all", ["orders.view"]), gate: "2fa" as const };
  return null;
}

const staffAccess: StaffAccessPort = { resolve: async (user) => resolveStaffSync(user) };

const shared = vi.hoisted(() => ({ users: [] as { id: string }[], tokenOf: null as unknown as (u: { id: string }) => string }));

const RECEIPT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const DEAL_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

vi.mock("next/headers", () => import("../../../apps/api/src/http/next-shim"));
vi.mock("next/server", () => import("../../../apps/api/src/http/next-shim"));
vi.mock("next/navigation", () => import("../../../apps/api/src/http/next-shim"));
vi.mock("@/server/container", () => ({
  container: () => ({
    sales: {
      receipts: {
        find: async (id: string) => (id === RECEIPT_ID ? { id, dealId: DEAL_ID, mime: "image/jpeg", fileName: "Чек Kaspi.jpg" } : null),
        read: async () => Buffer.from("jpeg-bytes"),
      },
      deals: { findById: async (id: string) => (id === DEAL_ID ? { id, assigneeId: "11111111-1111-4111-8111-111111111111" } : null) },
    },
  }),
}));
vi.mock("@/server/auth", async (orig) => {
  const actual = await orig<typeof import("@/server/auth")>();
  const { legacyRequestContext } = await import("@/server/request-context");
  return {
    ...actual,
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
    audit: async () => {},
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

const { assertRouteParity, createLegacyTestApp } = await import("./parity");
const { legacySiteOpsPorts } = await import("../src/legacy/site-ops.ports");
const { handleSiteRoute } = await import("../../../apps/api/src/site-routes");

const asOwner = { cookie: `mb_session=${sessionOf(OWNER)}` };
const asSales = { cookie: `mb_session=${sessionOf(SALES)}` };
const asNo2fa = { cookie: `mb_session=${sessionOf(NO_2FA)}` };
const asClient = { cookie: `mb_session=${sessionOf(CLIENT)}` };

let app: NestFastifyApplication;
let legacy: ReturnType<typeof createLegacyTestApp>;

beforeAll(async () => {
  const ports = (legacySiteOpsPorts as { useFactory: () => unknown }).useFactory();
  ({ app } = await bootTestApp({ users: ALL_USERS, overrides: [[STAFF_ACCESS, staffAccess], [SITE_OPS_PORTS, ports]] }));
  legacy = createLegacyTestApp({ users: ALL_USERS, siteRoutes: handleSiteRoute });
});

afterAll(() => app.close());

describe("паритет NestJS ↔ mybook-api: Контекст 7B с настоящими обработчиками сайта", () => {
  it("чужой метод — 405 с тем же Allow", async () => {
    for (const [method, url] of [
      ["PUT", "/api/payments/kaspi/webhook"],
      ["POST", `/api/admin/receipts/${RECEIPT_ID}`],
      ["DELETE", "/api/admin/calls/whatsapp/live"],
      // Статический …/live без POST — 405, а не обработчик …/{id} со звонком «live» (выбор шаблона окончателен).
      ["POST", "/api/admin/calls/whatsapp/live"],
      ["POST", "/api/v1/site/admin/calls/whatsapp/live"],
      ["PATCH", `/api/v1/site/payments/kaspi/invoices/${RECEIPT_ID}`],
    ] as const) {
      try {
        await assertRouteParity({ nest: app, legacy, method, url, headers: asOwner });
      } catch (err) {
        throw new Error(`${method} ${url}: ${String(err instanceof Error ? err.message : err)}`);
      }
    }
  });

  it("чек оплаты сделки: без входа, клиент, без права, без 2FA, чужая сделка, нет чека и сам файл — байт в байт", async () => {
    const url = `/api/admin/receipts/${RECEIPT_ID}`;
    for (const headers of [{}, asClient, asNo2fa, asSales, asOwner]) {
      await assertRouteParity({ nest: app, legacy, method: "GET", url, headers });
    }
    await assertRouteParity({ nest: app, legacy, method: "GET", url: `/api/admin/receipts/${DEAL_ID}`, headers: asOwner });
    await assertRouteParity({ nest: app, legacy, method: "GET", url: "/api/admin/receipts/not-a-uuid", headers: asOwner });
  });
});
