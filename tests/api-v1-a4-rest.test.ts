import { describe, expect, it, vi } from "vitest";
import { crmInvoiceRoutes, crmMobileRestRoutes, v1 } from "@mybook/contracts";
import { HttpError } from "@/server/api";

vi.mock("@/i18n/server", async () => ({ getMessages: async () => ({ api: (await import("@/i18n/messages/ru/api")).api }), getLocale: async () => "ru" }));

const { createApp } = await import("../apps/api/src/app");
const { createRouter } = await import("../apps/api/src/http/router");
const { handlers } = await import("../apps/api/src/routes");
const { redirect } = await import("../apps/api/src/http/next-shim");

const ID1 = "11111111-2222-4333-8444-555555555555";
const ID2 = "22222222-3333-4444-8555-666666666666";
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

const req = (app: ReturnType<typeof createApp>, method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>) =>
  app(
    new Request(`http://127.0.0.1:3044${path}`, {
      method,
      headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...extraHeaders },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  );

describe("API v1 A4: cherry-pick счетов/push и хвосты /api/mobile/*", () => {
  const router = createRouter(v1);

  it("все маршруты crmInvoiceRoutes, crmPush* и crmMobileRestRoutes подключены в v1 и имеют обработчики", () => {
    for (const name of [...Object.keys(crmInvoiceRoutes), ...Object.keys(crmMobileRestRoutes), "crmPushConfig", "crmDevicePut", "crmDeviceDelete"]) {
      expect(v1).toHaveProperty(name);
      expect(handlers).toHaveProperty(name);
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
    const app = createApp(handlers, staffAuth(false));
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

  it("валидация тела и ETag/304 работают для новых маршрутов (шаблоны, смена, задача, пересылка, статус заказа)", async () => {
    const crmMyTemplates = vi.fn(async () => ({
      mine: [{ id: ID1, title: "Привет", text: "Добрый день, {name}!" }],
      shared: [{ id: ID2, title: "Общий", text: "Спасибо за заказ" }],
    }));
    const crmShiftSet = vi.fn(async ({ input }: { input: { body: { onShift: boolean } } }) => ({ ok: true as const, onShift: input.body.onShift }));
    const crmChatForward = vi.fn(async ({ input }: { input: { body: { messageIds: string[]; targetIds: string[] } } }) => ({
      ok: true as const,
      forwarded: input.body.messageIds.length,
      total: input.body.messageIds.length,
      failed: [],
    }));
    const crmOrderStatus = vi.fn(async () => ({ ok: true as const }));
    const app = createApp({ ...handlers, crmMyTemplates, crmShiftSet, crmChatForward, crmOrderStatus } as typeof handlers, staffAuth(true));

    // GET + ETag -> 304
    const first = await req(app, "GET", "/api/v1/crm/my-templates");
    expect(first.status).toBe(200);
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();
    const cached = await req(app, "GET", "/api/v1/crm/my-templates", undefined, { "if-none-match": etag! });
    expect(cached.status).toBe(304);

    // Смена: strict-валидация и успех
    expect((await req(app, "POST", "/api/v1/crm/me/shift", { onShift: "yes" })).status).toBe(400);
    const shiftRes = await req(app, "POST", "/api/v1/crm/me/shift", { onShift: true });
    expect(shiftRes.status).toBe(200);
    expect(await shiftRes.json()).toEqual({ ok: true, onShift: true });

    // Пересылка: пустой список сообщений -> 400; валидные uuid -> 200
    expect((await req(app, "POST", `/api/v1/crm/chats/${ID1}/forward`, { messageIds: [], targetIds: [ID2] })).status).toBe(400);
    const fwd = await req(app, "POST", `/api/v1/crm/chats/${ID1}/forward`, { messageIds: [ID1], targetIds: [ID2] });
    expect(fwd.status).toBe(200);
    expect(await fwd.json()).toEqual({ ok: true, forwarded: 1, total: 1, failed: [] });

    // Статус заказа: неизвестный статус -> 400; валидный -> 200
    expect((await req(app, "POST", `/api/v1/crm/orders/${ID1}/status`, { status: "unknown" })).status).toBe(400);
    expect((await req(app, "POST", `/api/v1/crm/orders/${ID1}/status`, { status: "printing" })).status).toBe(200);
  });

  it("multipart голосовое crmChatSendVoice передаёт файл поля voice и query replyToId", async () => {
    const crmChatSendVoice = vi.fn(async ({ input }: { input: { chatId: string; replyToId?: string; files: File[] } }) => ({
      id: ID2,
      status: "sent",
      error: null,
      converted: input.files.length === 1 && input.replyToId === ID1,
    }));
    const app = createApp({ ...handlers, crmChatSendVoice } as typeof handlers, staffAuth(true));
    const form = new FormData();
    form.append("voice", new File([new Uint8Array([1, 2, 3, 4])], "rec.m4a", { type: "audio/mp4" }));
    const res = await app(new Request(`http://127.0.0.1:3044/api/v1/crm/chats/${ID1}/voice?replyToId=${ID1}`, { method: "POST", body: form }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: ID2, status: "sent", error: null, converted: true });
  });

  it("next-shim redirect() бросает Next-совместимый NEXT_REDIRECT digest (для createDealAction / deleteDealAction в mybook-api)", () => {
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
