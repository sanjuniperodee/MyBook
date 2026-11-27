import { describe, expect, it, vi } from "vitest";
import { crmInvoiceRoutes, crmMobileRestRoutes, v1 } from "@mybook/contracts";
import { HttpError } from "@/server/api";

vi.mock("@/i18n/server", async (orig) => ({ ...(await orig<object>()), getMessages: async () => ({ api: (await import("@/i18n/messages/ru/api")).api }), getLocale: async () => "ru" }));

const { nestApi, legacyAuth } = await import("./api");
const { createRouter } = await import("@mybook/contracts");
const { redirect } = await import("@/server/http/next-shim");
const { ROUTE_REGISTRY } = await import("../../apps/backend/src/core/routes/route-registry");

const ID1 = "11111111-2222-4333-8444-555555555555";
const staffUser = { id: ID1, name: "Менеджер", email: "m@x.kz", phone: null, locale: "ru", role: "admin", staffDisabled: false } as never;

const staffAuth = (ok = true) => ({
  user: async () => {
    if (!ok) throw new HttpError(401, "unauthorized");
    return staffUser;
  },
  staff: async () => {
    if (!ok) throw new HttpError(403, "forbidden");
    return staffUser;
  },
});

const req = (app: (r: Request) => Promise<Response>, method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>) =>
  app(
    new Request(`http://127.0.0.1:3044${path}`, {
      method,
      headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...extraHeaders },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  );

describe("API v1 A4: cherry-pick счетов/push и хвосты /api/mobile/*", () => {
  const router = createRouter(v1);

  it("все маршруты crmInvoiceRoutes, crmPush* и crmMobileRestRoutes подключены в v1 и зарегистрированы в бэкенде на Nest", async () => {
    const app = await nestApi({ auth: legacyAuth(staffAuth(true)) });
    const registered = new Set(app.app.get<{ list(): { method: string; path: string }[] }>(ROUTE_REGISTRY).list().map((r) => `${r.method} ${r.path}`));
    for (const name of [...Object.keys(crmInvoiceRoutes), ...Object.keys(crmMobileRestRoutes), "crmPushConfig", "crmDevicePut", "crmDeviceDelete"]) {
      expect(v1).toHaveProperty(name);
      const def = v1[name as keyof typeof v1];
      expect(registered.has(`${def.method} ${def.path.replace(/\{(\w+)\}/g, ":$1")}`), name).toBe(true);
    }
  });

  it("маршрутизация не конфликтует между статическими и параметрическими путями", () => {
    expect(router.match("GET", "/api/v1/crm/me")).toMatchObject({ name: "crmMe" });
    expect(router.match("POST", "/api/v1/crm/me/shift")).toMatchObject({ name: "crmShiftSet" });
    expect(router.match("GET", "/api/v1/crm/overview")).toMatchObject({ name: "crmOverview" });
    expect(router.match("GET", "/api/v1/crm/my-templates")).toMatchObject({ name: "crmMyTemplates" });
    expect(router.match("POST", "/api/v1/crm/my-templates/reorder")).toMatchObject({ name: "crmMyTemplatesReorder" });
    expect(router.match("POST", "/api/v1/crm/my-templates/draft")).toMatchObject({ name: "crmMyTemplateDraft" });
    expect(router.match("DELETE", `/api/v1/crm/my-templates/${ID1}`)).toMatchObject({ name: "crmMyTemplateDelete", params: { id: ID1 } });
    expect(router.match("POST", `/api/v1/crm/my-templates/${ID1}/duplicate`)).toMatchObject({ name: "crmMyTemplateDuplicate", params: { id: ID1 } });
    expect(router.match("POST", "/api/v1/crm/chats/open")).toMatchObject({ name: "crmChatOpen" });
    expect(router.match("GET", "/api/v1/crm/chat-targets")).toMatchObject({ name: "crmChatForwardTargets" });
    expect(router.match("GET", `/api/v1/crm/chat-messages/${ID1}/order`)).toMatchObject({ name: "crmChatMessageOrder", params: { messageId: ID1 } });
    expect(router.match("GET", "/api/v1/crm/catalog/for-chat")).toMatchObject({ name: "crmChatCatalog" });
    expect(router.match("POST", "/api/v1/crm/calls/dial")).toMatchObject({ name: "crmCallDial" });
    expect(router.match("POST", `/api/v1/crm/calls/${ID1}/handled`)).toMatchObject({ name: "crmCallHandled", params: { callId: ID1 } });
    expect(router.match("GET", `/api/v1/crm/tasks/${ID1}`)).toMatchObject({ name: "crmTaskGet", params: { taskId: ID1 } });
    expect(router.match("POST", "/api/v1/crm/deals")).toMatchObject({ name: "crmDealCreate" });
    expect(router.match("POST", `/api/v1/crm/orders/${ID1}/status`)).toMatchObject({ name: "crmOrderStatus", params: { orderId: ID1 } });
    expect(router.match("GET", "/api/v1/crm/invoices/form")).toMatchObject({ name: "crmInvoiceForm" });
    expect(router.match("GET", "/api/v1/crm/push")).toMatchObject({ name: "crmPushConfig" });
  });

  it("все новые CRM-маршруты требуют auth: staff (не-сотруднику — 403)", async () => {
    // Вошёл, но не сотрудник (клиент); без входа — 401 раньше прав.
    const client = { user: async () => ({ ...(staffUser as object), role: "user" }), staff: staffAuth(false).staff };
    const app = await nestApi({ auth: legacyAuth(client) });
    for (const [method, path] of [
      ["GET", "/api/v1/crm/me"],
      ["POST", "/api/v1/crm/me/shift"],
      ["GET", "/api/v1/crm/my-templates"],
      ["POST", "/api/v1/crm/calls/dial"],
      ["GET", "/api/v1/crm/catalog/for-chat"],
      ["POST", "/api/v1/crm/chats/open"],
      ["POST", "/api/v1/crm/deals"],
      ["POST", "/api/v1/crm/tasks"],
      ["GET", "/api/v1/crm/invoices/form"],
      ["GET", "/api/v1/crm/push"],
    ]) {
      const res = await req(app, method, path, method === "POST" ? {} : undefined);
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });

  // Разбор тела, ETag/304 и голосовое multipart (поле voice, replyToId) у этих маршрутов проверяет e2e бэкенда:
  // apps/backend/test/crm-mobile-api.e2e.test.ts — «профиль, смена и обзор», «личные шаблоны», «звонки и статус заказа»,
  // «чаты, сообщения, пересылка и голосовые».

  it("next-shim redirect() бросает Next-совместимый NEXT_REDIRECT digest (для createDealAction / deleteDealAction в бэкенде)", () => {
    let caught: unknown;
    try {
      redirect(`/admin/deals/${ID1}`);
    } catch (err) {
      caught = err;
    }
    const digest = (caught as { digest?: string })?.digest;
    expect(digest).toBe(`NEXT_REDIRECT;replace;/admin/deals/${ID1};307;`);
    expect(digest?.split(";")[2]?.split("/").pop()).toBe(ID1);
  });
});
