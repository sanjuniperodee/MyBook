import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { crmMobileRestRoutes } from "@mybook/contracts";
import { StaffContext } from "@/modules/access/domain/StaffContext";
import { isPhoneEmail } from "@/modules/identity";
import { allPermissions, type Permission } from "@/shared/domain/permissions";
import { STAFF_ACCESS, type StaffAccessPort } from "../src/core/auth/staff";
import { CRM_MOBILE_API_PORTS } from "../src/modules/crm-mobile-api/crm-mobile-api.tokens";
import { bootTestApp, sessionOf, testUser } from "./app";

const OWNER = testUser("11111111-1111-4111-8111-111111111111", { name: "Айгерим", email: "owner@mybooks.kz", role: "admin" });
const SALES = testUser("22222222-2222-4222-8222-222222222222", { name: "Данияр", email: "sales@mybooks.kz", role: "admin" });
const NO_PERMS = testUser("44444444-4444-4444-8444-444444444444", { name: "Стажёр", email: "intern@mybooks.kz", role: "admin" });
const REGULAR = testUser("88888888-8888-4888-8888-888888888888", { name: "Клиент", email: "client@mybooks.kz", role: "user" });
const ALL_USERS = [OWNER, SALES, NO_PERMS, REGULAR];

const TPL_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TPL_ID_2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab";
const CHAT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TARGET_CHAT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc";
const MSG_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CALL_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const DEAL_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const STAGE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeef";
const TASK_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const ORDER_ID = "99999999-9999-4999-8999-999999999999";
const CLIENT_ID = "12121212-1212-4121-8121-121212121212";

const FIXED_DATE = new Date("2026-11-28T10:00:00.000Z");
const FIXED_NOTE_AT = new Date("2026-11-26T09:00:00.000Z");

const makeCtx = (id: string, roleName: string, scope: "all" | "own", perms: readonly Permission[], isOwner = false) =>
  new StaffContext(id, roleName, isOwner ? "owner" : null, scope, new Set(perms), isOwner, { isPhoneEmail });

function resolveStaffSync(user: typeof OWNER) {
  if (user.role !== "admin" || user.staffDisabled) return null;
  if (user.id === OWNER.id) return makeCtx(user.id, "Руководитель", "all", allPermissions, true);
  if (user.id === SALES.id) {
    return makeCtx(user.id, "Менеджер", "own", ["chats.view", "chats.send", "deals.view", "deals.edit", "calls.view", "calls.make"]);
  }
  if (user.id === NO_PERMS.id) return makeCtx(user.id, "Стажёр", "own", []);
  return null;
}

const staffAccess: StaffAccessPort = {
  async resolve(user) {
    const context = resolveStaffSync(user);
    return context ? { context, gate: null } : null;
  },
};

const shared = vi.hoisted(() => ({
  catalogThrow: false,
  chatAssigneeId: "22222222-2222-4222-8222-222222222222" as string | null,
  convMissing: false,
  convertVoiceOk: true,
  sendBlocked: null as string | null,
  taskMissing: false,
  dealCreateError: null as string | null,
  forwardError: null as string | null,
  orderMoveError: null as string | null,
}));

const taskDetailRaw = {
  raw: {
    task: {
      id: TASK_ID,
      title: "Перезвонить по макету",
      kind: "call" as const,
      dueAt: FIXED_DATE,
      doneAt: null,
      assigneeId: OWNER.id,
      createdById: OWNER.id,
      remindBeforeMin: 15,
      result: null,
      dealId: DEAL_ID,
      orderId: null,
      clientId: CLIENT_ID,
    },
    clientName: "Асель",
    clientEmail: "asel@example.kz",
    orderNumber: null,
    dealTitle: "Книга для мамы",
    dealContact: "Асель",
    dealNumber: 42,
  },
  row: {
    remindBeforeMin: 15,
    contact: { phone: "77011234567", target: { dealId: DEAL_ID }, pbx: true, chat: true },
  },
  task: {
    id: TASK_ID,
    title: "Перезвонить по макету",
    kind: "call",
    dueAt: FIXED_DATE,
    doneAt: null,
    result: "",
    assigneeId: OWNER.id,
    assignee: "Айгерим",
    createdBy: "Айгерим",
    fromBot: false,
    overdue: false,
    editable: true,
  },
  deal: {
    id: DEAL_ID,
    number: 42,
    title: "Книга для мамы",
    stage: { name: "В работе", color: "#3b82f6", kind: "open" },
    amount: 29000,
    amountLabel: "29 000 ₸",
    source: "WhatsApp",
    assignee: "Айгерим",
    unsorted: false,
    contactName: "Асель",
  },
  client: { id: CLIENT_ID, name: "Асель", email: "asel@example.kz", phone: "+7 701 123-45-67", masked: false },
  contact: { name: "Асель", phone: "+7 701 123-45-67", email: "asel@example.kz", masked: false },
  order: { id: ORDER_ID, number: 1042, status: "paid", statusLabel: "Оплачен", amountLabel: "29 000 ₸" },
  chat: { id: CHAT_ID, preview: "Спасибо!", unread: 1 },
  notes: [{ id: "n-1", kind: "note", text: "Согласовали обложку", author: "Айгерим", at: FIXED_NOTE_AT }],
  others: [{ id: "t-2", title: "Уточнить доставку", dueAt: FIXED_DATE, overdue: false }],
};

const mockContainer = {
  reporting: {
    live: async () => ({
      counters: { attention: 2, tasks: 5, chats: 3, calls: 1, deals: 4, reviews: 0, finance: 1 },
      unread: 7,
    }),
    dashboard: async () => ({
      cur: { sum: 145000, n: 5 },
      prev: { sum: 87000, n: 3 },
      newUsers: { cur: 18, prev: 12 },
      daily: [{ d: "2026-11-25", sum: 58000, n: 2 }],
      funnelRows: { rows: [{ registered: 100, with_book: 60, engaged: 40, ordered: 20, paid: 10 }] },
      byPlan: [
        { plan: "digital", sum: 20000, n: 2 },
        { plan: "hardcover", sum: 125000, n: 3 },
      ],
      attention: [{ id: "o-1" }],
      deadlines: [{ id: "d-1" }],
      dealDeadlines: [{ id: "dd-1" }],
    }),
    stageCounts: async () => [{ stageId: STAGE_ID, n: 6 }],
  },
  sales: {
    queries: {
      listStages: async () => [
        { id: STAGE_ID, name: "В работе", color: "#3b82f6", kind: "open" },
        { id: "stage-won", name: "Оплачен", color: "#22c55e", kind: "won" },
      ],
    },
  },
  messaging: {
    view: {
      templates: async () => [
        { id: TPL_ID, title: "Личный", text: "Привет!", own: true },
        { id: TPL_ID_2, title: "Общий", text: "Здравствуйте!", own: false },
      ],
    },
    queries: {
      conversation: async (id: string) => (shared.convMissing ? null : { id, assigneeId: shared.chatAssigneeId }),
    },
    sendUpload: async () => ({ id: MSG_ID, status: "sent", error: null }),
  },
};

vi.mock("next/headers", () => import("../../../apps/api/src/http/next-shim"));
vi.mock("next/server", () => import("../../../apps/api/src/http/next-shim"));
vi.mock("next/navigation", () => import("../../../apps/api/src/http/next-shim"));
vi.mock("@/server/container", () => ({ container: () => mockContainer }));
vi.mock("@/server/shift", () => ({ autoShiftOnVisit: async () => true }));
vi.mock("@/server/audio-convert", () => ({
  convertAudio: async () => (shared.convertVoiceOk ? { data: new Uint8Array([1, 2, 3]), mime: "audio/ogg; codecs=opus" } : null),
}));
vi.mock("@/server/task-detail", () => ({
  loadTaskDetail: async () => (shared.taskMissing ? null : taskDetailRaw),
}));
vi.mock("@/server/crm-lists/work", () => ({
  taskJson: () => ({
    id: TASK_ID,
    title: "Перезвонить по макету",
    kind: "call",
    dueAt: FIXED_DATE.toISOString(),
    overdue: false,
    done: false,
    remindBeforeMin: 15,
    fromBot: false,
    assigneeId: OWNER.id,
    editable: true,
    context: { type: "deal", id: DEAL_ID, label: "Д42 · Асель" },
    target: { dealId: DEAL_ID, orderId: null, clientId: CLIENT_ID },
  }),
}));
vi.mock("@/server/auth", async () => {
  const shim = await import("../../../apps/api/src/http/next-shim");
  return {
    getCurrentUser: async () => {
      const jar = await shim.cookies();
      const hdrs = await shim.headers();
      const bearer = hdrs.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{20,200})$/)?.[1] ?? null;
      const tok = jar.get("mb_session")?.value ?? bearer;
      return tok ? ALL_USERS.find((u) => sessionOf(u) === tok) ?? null : null;
    },
  };
});
vi.mock("@/server/access", async () => {
  const { getCurrentUser } = await import("@/server/auth");
  const FORBIDDEN_ERROR = Symbol.for("mybook.forbidden-error");
  class MockForbiddenError extends Error {
    constructor(message = "Недостаточно прав") {
      super(message);
      Reflect.set(this, FORBIDDEN_ERROR, true);
    }
    static is(err: unknown): err is MockForbiddenError {
      return err instanceof MockForbiddenError;
    }
  }
  return {
    ForbiddenError: MockForbiddenError,
    getStaff: async () => {
      const u = await getCurrentUser();
      if (!u) return null;
      const context = resolveStaffSync(u);
      if (!context) return null;
      return {
        user: u,
        roleName: context.roleName,
        roleKey: context.roleKey,
        scope: context.scope,
        permissions: context.permissions,
        isOwner: context.isOwner,
        context,
      };
    },
    can: (staff: { context: StaffContext } | null, ...perms: Permission[]) => Boolean(staff?.context.can(...perms)),
    canWork: (staff: { context: StaffContext }, assigneeId: string | null | undefined) => staff.context.canWork(assigneeId),
    staffViewer: (staff: { user: { id: string }; scope: string }) => ({ userId: staff.user.id, seesAll: staff.scope === "all" }),
  };
});
vi.mock("@/server/crm-actions/crm", () => ({
  setShiftAction: async () => {},
  callAction: async () => ({ ok: true, message: "Сейчас зазвонит ваш телефон" }),
  markCallHandledAction: async () => ({ ok: true }),
  openChatAction: async () => ({ ok: true, id: CHAT_ID }),
}));
vi.mock("@/server/crm-actions/templates", () => ({
  saveMyTemplateAction: async () => ({ ok: true, id: TPL_ID }),
  deleteMyTemplateAction: async () => ({ ok: true }),
  duplicateTemplateAction: async () => ({ ok: true }),
  reorderMyTemplatesAction: async () => ({ ok: true }),
}));
vi.mock("@/server/crm-actions/ai", () => ({
  aiTemplateDraftAction: async () => ({
    ok: true,
    title: "Приветствие",
    text: "Здравствуйте, {{name}}!",
    replaced: [{ was: "Асель", with: "{{name}}" }],
    ai: true,
  }),
}));
vi.mock("@/server/crm-actions/catalog", () => ({
  chatProductsAction: async () => {
    if (shared.catalogThrow) throw new Error("GOWA down");
    return {
      ok: true,
      enabled: true,
      products: [{ id: "101", name: "Книга А5", price: 29000, currency: "KZT", hidden: false, image: true }],
    };
  },
  sendProductAction: async () => ({ ok: true }),
  sendCatalogLinkAction: async () => ({ ok: true }),
  orderItemsAction: async () => ({
    ok: true,
    items: [{ name: "Книга А5", quantity: 1, price: 29000 }],
    total: 29000,
    currency: "KZT",
  }),
}));
vi.mock("@/server/crm-actions/chats", () => ({
  forwardTargetsAction: async () => [{ id: TARGET_CHAT_ID, title: "Асель", channel: "WhatsApp", last: "Добрый день" }],
  assignConversationAction: async () => {},
  createDealFromChatAction: async () => ({ id: DEAL_ID }),
  forwardMessageAction: async () => (shared.forwardError ? { error: shared.forwardError } : { sent: 1, failed: [] }),
  sendInternalNoteAction: async () => ({ id: MSG_ID }),
  pinChatAction: async () => ({ ok: true }),
  markReadAction: async () => ({ read: true }),
  setConversationStatusAction: async () => {},
  sendMessageAction: async () =>
    shared.sendBlocked ? { blocked: shared.sendBlocked } : { id: MSG_ID, status: "sent", error: null },
  editMessageAction: async () => ({ ok: true }),
  deleteMessageAction: async () => ({ ok: true }),
  resendMessageAction: async () => ({ ok: true }),
  transcribeMessageAction: async () => ({ text: "Хочу заказать книгу маме" }),
}));
vi.mock("@/server/crm-actions/deals", () => ({
  createDealAction: async () => {
    if (shared.dealCreateError) return { error: shared.dealCreateError };
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;/admin/deals/${DEAL_ID};307;` });
  },
  acceptDealAction: async () => ({ ok: true }),
  assignDealAction: async () => ({ ok: true }),
  moveDealAction: async () => ({ ok: true }),
  rejectDealAction: async () => ({ requested: false, message: "Заявка отклонена", deleted: true }),
}));
vi.mock("@/server/crm-actions/admin", () => ({
  addNoteAction: async () => ({ ok: "Заметка сохранена" }),
  createTaskAction: async () => ({ ok: "Задача добавлена" }),
  updateTaskAction: async () => ({}),
  deleteTaskAction: async () => ({}),
  completeTaskAction: async () => ({}),
  snoozeTaskAction: async () => ({}),
  toggleTaskAction: async () => ({}),
  moveOrderAction: async () => (shared.orderMoveError ? { error: shared.orderMoveError } : {}),
}));

const { assertRouteParity, createLegacyTestApp } = await import("./parity");
const { legacyCrmMobileApiPorts } = await import("../src/legacy/crm-mobile-api.ports");

function multipartVoice(data?: Buffer) {
  const boundary = "----ParityVoiceBoundary9e3b";
  const parts: Buffer[] = [];
  if (data) {
    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="voice"; filename="clip.m4a"\r\nContent-Type: audio/mp4\r\n\r\n`),
      data,
      Buffer.from("\r\n"),
    );
  } else {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="note"\r\n\r\nempty\r\n`));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    body: Buffer.concat(parts),
  };
}

const asOwner = { cookie: `mb_session=${sessionOf(OWNER)}` };
const asSales = { cookie: `mb_session=${sessionOf(SALES)}` };
const asNoPerms = { cookie: `mb_session=${sessionOf(NO_PERMS)}` };
const asRegular = { cookie: `mb_session=${sessionOf(REGULAR)}` };

let app: NestFastifyApplication;
let legacy: ReturnType<typeof createLegacyTestApp>;

beforeAll(async () => {
  const factoryProvider = legacyCrmMobileApiPorts as { useFactory: (c: unknown) => unknown };
  const realPorts = factoryProvider.useFactory(mockContainer);
  ({ app } = await bootTestApp({
    users: ALL_USERS,
    overrides: [
      [STAFF_ACCESS, staffAccess],
      [CRM_MOBILE_API_PORTS, realPorts],
    ],
  }));
  legacy = createLegacyTestApp({
    users: ALL_USERS,
    staff: async (user) => {
      if (!resolveStaffSync(user)) {
        const { HttpError } = await import("@/server/api");
        throw new HttpError(403, "forbidden");
      }
    },
  });
});

afterAll(() => app.close());

beforeEach(() => {
  shared.catalogThrow = false;
  shared.chatAssigneeId = SALES.id;
  shared.convMissing = false;
  shared.convertVoiceOk = true;
  shared.sendBlocked = null;
  shared.taskMissing = false;
  shared.dealCreateError = null;
  shared.forwardError = null;
  shared.orderMoveError = null;
});

const PARITY_CASES: Record<
  keyof typeof crmMobileRestRoutes,
  { method: "GET" | "POST" | "PATCH" | "DELETE"; url: string; body?: Record<string, unknown>; multipart?: boolean }
> = {
  crmMe: { method: "GET", url: "/api/v1/crm/me" },
  crmShiftSet: { method: "POST", url: "/api/v1/crm/me/shift", body: { onShift: true } },
  crmOverview: { method: "GET", url: "/api/v1/crm/overview?period=30" },
  crmMyTemplates: { method: "GET", url: "/api/v1/crm/my-templates" },
  crmMyTemplateSave: { method: "POST", url: "/api/v1/crm/my-templates", body: { title: "Привет", text: "Здравствуйте!" } },
  crmMyTemplateDelete: { method: "DELETE", url: `/api/v1/crm/my-templates/${TPL_ID}` },
  crmMyTemplateDuplicate: { method: "POST", url: `/api/v1/crm/my-templates/${TPL_ID}/duplicate` },
  crmMyTemplatesReorder: { method: "POST", url: "/api/v1/crm/my-templates/reorder", body: { ids: [TPL_ID] } },
  crmMyTemplateDraft: { method: "POST", url: "/api/v1/crm/my-templates/draft", body: { chatId: CHAT_ID, messageId: MSG_ID } },
  crmCallDial: { method: "POST", url: "/api/v1/crm/calls/dial", body: { dealId: DEAL_ID } },
  crmCallHandled: { method: "POST", url: `/api/v1/crm/calls/${CALL_ID}/handled` },
  crmChatCatalog: { method: "GET", url: "/api/v1/crm/catalog/for-chat" },
  crmChatSendCatalog: { method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/catalog`, body: { productId: "101" } },
  crmChatMessageOrder: { method: "GET", url: `/api/v1/crm/chat-messages/${MSG_ID}/order` },
  crmChatOpen: { method: "POST", url: "/api/v1/crm/chats/open", body: { clientId: CLIENT_ID } },
  crmChatForwardTargets: { method: "GET", url: "/api/v1/crm/chat-targets?q=test" },
  crmChatAssign: { method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/assign`, body: { userId: SALES.id } },
  crmChatCreateDeal: { method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/deal` },
  crmChatForward: { method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/forward`, body: { messageIds: [MSG_ID], targetIds: [TARGET_CHAT_ID] } },
  crmChatNote: { method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/note`, body: { text: "Заметка" } },
  crmChatPin: { method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/pin`, body: { pinned: true } },
  crmChatRead: { method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/read` },
  crmChatStatus: { method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/status`, body: { status: "closed" } },
  crmChatSendMessage: { method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/messages`, body: { text: "Добрый день!" } },
  crmChatSendVoice: { method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/voice`, multipart: true },
  crmChatMessageEdit: { method: "PATCH", url: `/api/v1/crm/chats/${CHAT_ID}/messages/${MSG_ID}`, body: { text: "Правка" } },
  crmChatMessageDelete: { method: "DELETE", url: `/api/v1/crm/chats/${CHAT_ID}/messages/${MSG_ID}` },
  crmChatMessageResend: { method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/messages/${MSG_ID}/resend` },
  crmChatMessageTranscribe: { method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/messages/${MSG_ID}/transcribe` },
  crmDealCreate: { method: "POST", url: "/api/v1/crm/deals", body: { title: "Сделка с сайта" } },
  crmDealAccept: { method: "POST", url: `/api/v1/crm/deals/${DEAL_ID}/accept` },
  crmDealAssign: { method: "POST", url: `/api/v1/crm/deals/${DEAL_ID}/assign`, body: { userId: SALES.id } },
  crmDealMove: { method: "POST", url: `/api/v1/crm/deals/${DEAL_ID}/move`, body: { stageId: STAGE_ID } },
  crmDealNote: { method: "POST", url: `/api/v1/crm/deals/${DEAL_ID}/notes`, body: { text: "Заметка к сделке" } },
  crmDealReject: { method: "POST", url: `/api/v1/crm/deals/${DEAL_ID}/reject`, body: { spam: false, reason: "Дубль" } },
  crmDealTaskCreate: { method: "POST", url: `/api/v1/crm/deals/${DEAL_ID}/tasks`, body: { title: "Позвонить клиенту" } },
  crmTaskCreate: { method: "POST", url: "/api/v1/crm/tasks", body: { title: "Проверить макет", remindBeforeMin: null } },
  crmTaskGet: { method: "GET", url: `/api/v1/crm/tasks/${TASK_ID}` },
  crmTaskUpdate: { method: "PATCH", url: `/api/v1/crm/tasks/${TASK_ID}`, body: { title: "Новая формулировка" } },
  crmTaskDelete: { method: "DELETE", url: `/api/v1/crm/tasks/${TASK_ID}` },
  crmTaskComplete: { method: "POST", url: `/api/v1/crm/tasks/${TASK_ID}/complete`, body: { result: "Сделано" } },
  crmTaskSnooze: { method: "POST", url: `/api/v1/crm/tasks/${TASK_ID}/snooze`, body: { by: "tomorrow" } },
  crmTaskToggle: { method: "POST", url: `/api/v1/crm/tasks/${TASK_ID}/toggle` },
  crmOrderStatus: { method: "POST", url: `/api/v1/crm/orders/${ORDER_ID}/status`, body: { status: "printing" } },
};

describe("побайтовый паритет NestJS ↔ mybook-api (Контекст 4B — все 44 маршрута crm-mobile-rest)", () => {
  it("все 44 маршрута совпадают байт в байт на успешном ответе (GET — с ETag и 304)", async () => {
    const keys = Object.keys(crmMobileRestRoutes) as (keyof typeof crmMobileRestRoutes)[];
    expect(keys).toHaveLength(44);
    expect(Object.keys(PARITY_CASES).sort()).toEqual([...keys].sort());

    for (const key of keys) {
      const c = PARITY_CASES[key];
      if (c.multipart) {
        const mp = multipartVoice(Buffer.from("voice-bytes"));
        await assertRouteParity({
          nest: app,
          legacy,
          method: c.method,
          url: c.url,
          headers: { ...asOwner, ...mp.headers },
          body: mp.body,
        });
      } else {
        await assertRouteParity({
          nest: app,
          legacy,
          method: c.method,
          url: c.url,
          headers: asOwner,
          body: c.body,
        });
      }
    }
  });

  it("ветки ошибок и особых статусов (401, 403, 400 badData/refused, 404, 405, 503, blocked, voice fallback) совпадают байт в байт", async () => {
    // 401 без входа и 403 не-сотрудник / нет прав / чужой Origin
    await assertRouteParity({ nest: app, legacy, method: "GET", url: "/api/v1/crm/me" });
    await assertRouteParity({ nest: app, legacy, method: "GET", url: "/api/v1/crm/overview", headers: asRegular });
    await assertRouteParity({ nest: app, legacy, method: "GET", url: "/api/v1/crm/overview", headers: asNoPerms });
    await assertRouteParity({ nest: app, legacy, method: "POST", url: `/api/v1/crm/orders/${ORDER_ID}/status`, headers: asNoPerms, body: { status: "printing" } });
    await assertRouteParity({
      nest: app,
      legacy,
      method: "POST",
      url: "/api/v1/crm/me/shift",
      headers: { ...asOwner, origin: "https://evil.example" },
      body: { onShift: false },
    });

    // 400 badData и 405 Allow
    await assertRouteParity({ nest: app, legacy, method: "GET", url: "/api/v1/crm/tasks/not-a-uuid", headers: asOwner });
    await assertRouteParity({ nest: app, legacy, method: "DELETE", url: "/api/v1/crm/me", headers: asOwner });

    // 404 на задаче и на голосовом
    shared.taskMissing = true;
    await assertRouteParity({ nest: app, legacy, method: "GET", url: `/api/v1/crm/tasks/${TASK_ID}`, headers: asOwner });
    shared.taskMissing = false;

    // 503 на каталоге при сбое шлюза
    shared.catalogThrow = true;
    await assertRouteParity({ nest: app, legacy, method: "GET", url: "/api/v1/crm/catalog/for-chat", headers: asOwner });
    shared.catalogThrow = false;

    // 400 refused: сделка, пересылка, статус заказа
    shared.dealCreateError = "Проверьте номер телефона";
    await assertRouteParity({ nest: app, legacy, method: "POST", url: "/api/v1/crm/deals", headers: asOwner, body: { title: "Сделка" } });
    shared.dealCreateError = null;

    shared.forwardError = "Сообщение не найдено";
    await assertRouteParity({
      nest: app,
      legacy,
      method: "POST",
      url: `/api/v1/crm/chats/${CHAT_ID}/forward`,
      headers: asOwner,
      body: { messageIds: [MSG_ID], targetIds: [TARGET_CHAT_ID] },
    });
    shared.forwardError = null;

    shared.orderMoveError = "Неоплаченный заказ нельзя в печать";
    await assertRouteParity({
      nest: app,
      legacy,
      method: "POST",
      url: `/api/v1/crm/orders/${ORDER_ID}/status`,
      headers: asOwner,
      body: { status: "printing" },
    });
    shared.orderMoveError = null;

    // Заблокированное фильтром сообщение (200 с blocked)
    shared.sendBlocked = "В сообщении номер карты";
    await assertRouteParity({
      nest: app,
      legacy,
      method: "POST",
      url: `/api/v1/crm/chats/${CHAT_ID}/messages`,
      headers: asOwner,
      body: { text: "4400 4301 1234 5678" },
    });
    shared.sendBlocked = null;

    // Голосовое: 404 нет диалога, 403 чужой диалог, 400 пустая запись, fallback без ffmpeg
    const voiceMp = multipartVoice(Buffer.from("voice-bytes"));
    shared.convMissing = true;
    await assertRouteParity({ nest: app, legacy, method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/voice`, headers: { ...asSales, ...voiceMp.headers }, body: voiceMp.body });
    shared.convMissing = false;

    shared.chatAssigneeId = OWNER.id;
    await assertRouteParity({ nest: app, legacy, method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/voice`, headers: { ...asSales, ...voiceMp.headers }, body: voiceMp.body });
    shared.chatAssigneeId = SALES.id;

    const emptyMp = multipartVoice();
    await assertRouteParity({ nest: app, legacy, method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/voice`, headers: { ...asSales, ...emptyMp.headers }, body: emptyMp.body });

    shared.convertVoiceOk = false;
    await assertRouteParity({ nest: app, legacy, method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/voice`, headers: { ...asSales, ...voiceMp.headers }, body: voiceMp.body });
  });
});
