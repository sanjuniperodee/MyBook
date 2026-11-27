import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { StaffContext } from "@/modules/access/domain/StaffContext";
import { isPhoneEmail } from "@/modules/identity";
import { allPermissions, type Permission } from "@/shared/domain/permissions";
import { STAFF_ACCESS, type StaffAccessPort } from "../src/core/auth/staff";
import { CRM_MOBILE_API_PORTS } from "../src/modules/crm-mobile-api/crm-mobile-api.tokens";
import { CRM_LISTS_PORTS } from "../src/modules/crm-core/crm-core.tokens";
import { CRM_MOBILE_SITE_PORTS } from "../src/modules/crm-mobile-site/crm-mobile-site.tokens";
import { IDENTITY_AUTH } from "../src/modules/identity/identity.tokens";
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
  apkPresent: false,
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
  identity: {
    auth: {
      logout: async () => {},
      openCompanionSession: async () => ({ token: "companion-token", expiresAt: new Date("2026-11-26T22:00:00Z") }),
    },
  },
  workspace: { inbox: { markRead: async () => {} } },
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
    deals: { findById: async () => ({ assigneeId: OWNER.id }) },
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
    media: {
      find: async (id: string) => (id === MSG_ID ? { conversation: { assigneeId: shared.chatAssigneeId, dealId: DEAL_ID } } : null),
    },
  },
};

vi.mock("next/headers", () => import("@/server/http/next-shim"));
vi.mock("next/server", () => import("@/server/http/next-shim"));
vi.mock("next/navigation", () => import("@/server/http/next-shim"));
vi.mock("@/server/container", () => ({ container: () => mockContainer }));
vi.mock("@/server/shift", () => ({ autoShiftOnVisit: async () => true }));
vi.mock("@/server/audio-convert", () => ({
  convertAudio: async () => (shared.convertVoiceOk ? { data: new Uint8Array([1, 2, 3]), mime: "audio/ogg; codecs=opus" } : null),
}));
vi.mock("@/server/task-detail", () => ({
  loadTaskDetail: async () => (shared.taskMissing ? null : taskDetailRaw),
}));
vi.mock("@/server/crm-lists/work", () => ({
  mobileToday: async () => ({ tasks: [], overdue: 0, deals: [], chats: [] }),
  mobileTasks: async () => [{ id: TASK_ID, title: "Перезвонить по макету" }],
  mobileStaff: async () => ({ staff: [{ id: OWNER.id, name: "Айгерим" }, { id: SALES.id, name: "Данияр" }] }),
  mobileCalls: async () => ({ calls: [] }),
  mobileClients: async () => ({ clients: [{ id: CLIENT_ID, name: "Асель" }] }),
  mobileClient: async () => ({ id: CLIENT_ID, name: "Асель", deals: [] }),
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
  const shim = await import("@/server/http/next-shim");
  return {
    sessionToken: async () => {
      const jar = await shim.cookies();
      return jar.get("mb_session")?.value ?? null;
    },
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
    audit: async () => {},
    canWork: (staff: { context: StaffContext }, assigneeId: string | null | undefined) => staff.context.canWork(assigneeId),
    canSeeAssigned: (staff: { context: StaffContext }, assigneeId: string | null | undefined) => staff.context.canSee(assigneeId),
    assertVisible: (staff: { context: StaffContext }, assigneeId: string | null | undefined) => {
      if (!staff.context.canSee(assigneeId)) throw new MockForbiddenError();
    },
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

// Профиль регистрации iPhone: случайный PayloadUUID и срок в токене — постоянные, чтобы ответы сравнивались байт в байт.
vi.mock("@/server/ios-app", async (orig) => {
  const actual = await orig<typeof import("@/server/ios-app")>();
  return {
    ...actual,
    enrollProfile: (origin: string, token: string) =>
      actual.enrollProfile(origin, token).replace(/<key>PayloadUUID<\/key><string>[^<]+<\/string>/, "<key>PayloadUUID</key><string>FIXED-UUID</string>"),
    iosToken: (userId: string, action: "enroll" | "install", ttlSec: number) => actual.iosToken(userId, action, ttlSec, FIXED_DATE.getTime()),
    iosStatus: async () => ({ build: { version: "1.15.0", build: "115", builtAt: "2026-11-26T08:00:00.000Z" }, devices: [] }),
    iosBuild: async () => null,
    readIosIpa: async () => Buffer.from("ipa"),
    saveIosDevice: async () => {},
  };
});
vi.mock("@/server/crm-lists/data", async (orig) => ({
  CHAT_FILTERS: (await orig<typeof import("@/server/crm-lists/data")>()).CHAT_FILTERS,
  mobileChatList: async () => ({ chats: [{ id: CHAT_ID, title: "Асель", unread: 1 }] }),
  mobileChatDetail: async () => ({ id: CHAT_ID, title: "Асель", messages: [] }),
  mobileMessages: async () => ({ messages: [{ id: MSG_ID, text: "Привет", direction: "in" }] }),
  mobileDeals: async () => ({ deals: [{ id: DEAL_ID, title: "Книга для мамы" }] }),
  mobileDealDetail: async () => ({ id: DEAL_ID, title: "Книга для мамы", notes: [] }),
}));
vi.mock("@/server/crm-lists/orders", () => ({
  mobileOrders: async () => ({ orders: [{ id: ORDER_ID, number: 1042 }] }),
  mobileOrder: async () => ({ id: ORDER_ID, number: 1042, status: "paid" }),
}));
vi.mock("@/server/crm-actions/invoices", () => ({
  invoiceFormInfoAction: async () => ({ ok: true, info: { amount: 29000, phone: "+77011234567" } }),
  issueInvoiceAction: async () => ({ ok: true, message: "Счёт выставлен", link: "https://pay.example/1", text: "Оплатите", sent: true }),
  cancelInvoiceAction: async () => ({ ok: true, message: "Счёт отменён" }),
  resendInvoiceAction: async () => ({ ok: true, message: "Отправлено", link: "https://pay.example/1", text: "Оплатите", sent: true }),
}));
vi.mock("@/server/mobile-apk", async (orig) => ({
  ...(await orig<typeof import("@/server/mobile-apk")>()),
  hasMobileApk: async () => shared.apkPresent,
  readMobileApk: async () => Buffer.from("PK\x03\x04apk-bytes"),
  saveMobileApk: async () => {},
}));
vi.mock("@/server/chat-audio", () => ({
  chatAudioFile: async () => ({ path: "/tmp/voice.ogg", mime: "audio/ogg" }),
}));
vi.mock("@/server/range-file", async (orig) => ({
  ...(await orig<typeof import("@/server/range-file")>()),
  serveFile: async (_path: string, mime: string, _req: unknown, headers: Record<string, string>) =>
    new Response(new Uint8Array([79, 103, 103, 83]), { headers: { "Content-Type": mime, "Content-Length": "4", ...headers } }),
}));
vi.mock("@/modules/workspace", async (orig) => ({
  ...(await orig<typeof import("@/modules/workspace")>()),
  staffNotifications: async () => [{ id: "n-1", title: "Новая заявка", at: FIXED_NOTE_AT.toISOString(), read: false }],
}));

const { assertRoute } = await import("./expected");
const { legacyCrmMobileApiPorts } = await import("../src/legacy/crm-mobile-api.ports");
const { legacyCrmMobileSitePorts } = await import("../src/legacy/crm-mobile-site.ports");
const { legacyCrmListsPorts } = await import("../src/legacy/crm-core.ports");
const { legacyIdentityAuthPort } = await import("../src/legacy/identity.ports");

const ID = DEAL_ID;

/** Все 77 маршрутов сайта старого мобильного CRM и раздачи APK/iPhone — как в прежнем реестре сайта mybook-api. */
const ROUTES: Array<["GET" | "POST" | "PATCH" | "PUT" | "DELETE", string]> = [
  ["DELETE", `/api/mobile/chats/${ID}/messages/${MSG_ID}`],
  ["DELETE", `/api/mobile/push`],
  ["DELETE", `/api/mobile/tasks/${ID}`],
  ["DELETE", `/api/mobile/templates/${ID}`],
  ["GET", `/api/admin/ios-app/enroll`],
  ["GET", `/api/admin/ios-app/status`],
  ["GET", `/api/admin/mobile-apk`],
  ["GET", `/api/ios-app/ipa`],
  ["GET", `/api/ios-app/manifest`],
  ["GET", `/api/mobile/calls`],
  ["GET", `/api/mobile/catalog`],
  ["GET", `/api/mobile/chats`],
  ["GET", `/api/mobile/chats/messages/${MSG_ID}/audio`],
  ["GET", `/api/mobile/chats/messages/${MSG_ID}/order`],
  ["GET", `/api/mobile/chats/targets`],
  ["GET", `/api/mobile/chats/${ID}`],
  ["GET", `/api/mobile/chats/${ID}/messages`],
  ["GET", `/api/mobile/clients`],
  ["GET", `/api/mobile/clients/${ID}`],
  ["GET", `/api/mobile/deals`],
  ["GET", `/api/mobile/deals/${ID}`],
  ["GET", `/api/mobile/invoices/info`],
  ["GET", `/api/mobile/me`],
  ["GET", `/api/mobile/notifications`],
  ["GET", `/api/mobile/orders`],
  ["GET", `/api/mobile/orders/${ID}`],
  ["GET", `/api/mobile/overview`],
  ["GET", `/api/mobile/push`],
  ["GET", `/api/mobile/staff`],
  ["GET", `/api/mobile/tasks`],
  ["GET", `/api/mobile/tasks/${ID}`],
  ["GET", `/api/mobile/templates`],
  ["GET", `/api/mobile/today`],
  ["PATCH", `/api/mobile/chats/${ID}/messages/${MSG_ID}`],
  ["PATCH", `/api/mobile/tasks/${ID}`],
  ["POST", `/api/admin/mobile-apk`],
  ["POST", `/api/ios-app/udid`],
  ["POST", `/api/mobile/auth/2fa`],
  ["POST", `/api/mobile/auth/login`],
  ["POST", `/api/mobile/auth/logout`],
  ["POST", `/api/mobile/calls/dial`],
  ["POST", `/api/mobile/calls/${ID}/handled`],
  ["POST", `/api/mobile/chats/open`],
  ["POST", `/api/mobile/chats/${ID}/assign`],
  ["POST", `/api/mobile/chats/${ID}/catalog`],
  ["POST", `/api/mobile/chats/${ID}/deal`],
  ["POST", `/api/mobile/chats/${ID}/forward`],
  ["POST", `/api/mobile/chats/${ID}/messages`],
  ["POST", `/api/mobile/chats/${ID}/messages/${MSG_ID}/resend`],
  ["POST", `/api/mobile/chats/${ID}/messages/${MSG_ID}/transcribe`],
  ["POST", `/api/mobile/chats/${ID}/note`],
  ["POST", `/api/mobile/chats/${ID}/pin`],
  ["POST", `/api/mobile/chats/${ID}/read`],
  ["POST", `/api/mobile/chats/${ID}/status`],
  ["POST", `/api/mobile/chats/${ID}/voice`],
  ["POST", `/api/mobile/deals`],
  ["POST", `/api/mobile/deals/${ID}/accept`],
  ["POST", `/api/mobile/deals/${ID}/assign`],
  ["POST", `/api/mobile/deals/${ID}/move`],
  ["POST", `/api/mobile/deals/${ID}/notes`],
  ["POST", `/api/mobile/deals/${ID}/reject`],
  ["POST", `/api/mobile/deals/${ID}/tasks`],
  ["POST", `/api/mobile/invoices`],
  ["POST", `/api/mobile/invoices/${ID}`],
  ["POST", `/api/mobile/me/shift`],
  ["POST", `/api/mobile/notifications`],
  ["POST", `/api/mobile/orders/${ID}/status`],
  ["POST", `/api/mobile/push`],
  ["POST", `/api/mobile/tasks`],
  ["POST", `/api/mobile/tasks/${ID}/complete`],
  ["POST", `/api/mobile/tasks/${ID}/snooze`],
  ["POST", `/api/mobile/tasks/${ID}/toggle`],
  ["POST", `/api/mobile/templates`],
  ["POST", `/api/mobile/templates/draft`],
  ["POST", `/api/mobile/templates/reorder`],
  ["POST", `/api/mobile/templates/${ID}/duplicate`],
  ["POST", `/api/mobile/web-session`],
];

const asOwner = { cookie: `mb_session=${sessionOf(OWNER)}` };
const asNoPerms = { cookie: `mb_session=${sessionOf(NO_PERMS)}` };
const asSales = { cookie: `mb_session=${sessionOf(SALES)}` };
const asRegular = { cookie: `mb_session=${sessionOf(REGULAR)}` };

let app: NestFastifyApplication;

beforeAll(async () => {
  const apiPorts = (legacyCrmMobileApiPorts as { useFactory: (c: unknown) => unknown }).useFactory(mockContainer);
  const sitePorts = (legacyCrmMobileSitePorts as { useFactory: (c: unknown) => unknown }).useFactory(mockContainer);
  const listsPorts = (legacyCrmListsPorts as { useFactory: (c: unknown) => unknown }).useFactory(mockContainer);
  const identityAuth = (legacyIdentityAuthPort as { useFactory: (c: unknown) => unknown }).useFactory(mockContainer);
  ({ app } = await bootTestApp({
    users: ALL_USERS,
    overrides: [
      [STAFF_ACCESS, staffAccess],
      [CRM_MOBILE_API_PORTS, apiPorts],
      [CRM_MOBILE_SITE_PORTS, sitePorts],
      [CRM_LISTS_PORTS, listsPorts],
      [IDENTITY_AUTH, identityAuth],
    ],
  }));
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
  shared.apkPresent = false;
});

function multipartFile(field: string, filename: string, contentType: string, data: Buffer) {
  const boundary = "----ParityMobileSite7f1c";
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { headers: { "content-type": `multipart/form-data; boundary=${boundary}` }, body };
}

const bodyFor = (method: string) => (method === "GET" || method === "DELETE" ? undefined : {});

/** Тела запросов для успешного ответа (по смыслу — как у тех же действий в API v1, crm-mobile-api.parity). */
const BODIES: Record<string, Record<string, unknown>> = {
  "POST /api/mobile/me/shift": { onShift: true },
  "POST /api/mobile/templates": { title: "Привет", text: "Здравствуйте!" },
  "POST /api/mobile/templates/reorder": { ids: [TPL_ID] },
  "POST /api/mobile/templates/draft": { chatId: CHAT_ID, messageId: MSG_ID },
  "POST /api/mobile/calls/dial": { dealId: DEAL_ID },
  "POST /api/mobile/chats/open": { clientId: CLIENT_ID },
  [`POST /api/mobile/chats/${ID}/assign`]: { userId: SALES.id },
  [`POST /api/mobile/chats/${ID}/catalog`]: { productId: "101" },
  [`POST /api/mobile/chats/${ID}/forward`]: { messageIds: [MSG_ID], targetIds: [TARGET_CHAT_ID] },
  [`POST /api/mobile/chats/${ID}/note`]: { text: "Заметка" },
  [`POST /api/mobile/chats/${ID}/pin`]: { pinned: true },
  [`POST /api/mobile/chats/${ID}/status`]: { status: "closed" },
  [`POST /api/mobile/chats/${ID}/messages`]: { text: "Добрый день!" },
  [`PATCH /api/mobile/chats/${ID}/messages/${MSG_ID}`]: { text: "Правка" },
  "POST /api/mobile/deals": { title: "Сделка с сайта" },
  [`POST /api/mobile/deals/${ID}/assign`]: { userId: SALES.id },
  [`POST /api/mobile/deals/${ID}/move`]: { stageId: STAGE_ID },
  [`POST /api/mobile/deals/${ID}/notes`]: { text: "Заметка к сделке" },
  [`POST /api/mobile/deals/${ID}/reject`]: { spam: false, reason: "Дубль" },
  [`POST /api/mobile/deals/${ID}/tasks`]: { title: "Позвонить клиенту" },
  "POST /api/mobile/tasks": { title: "Проверить макет", remindBeforeMin: null },
  [`PATCH /api/mobile/tasks/${ID}`]: { title: "Новая формулировка" },
  [`POST /api/mobile/tasks/${ID}/complete`]: { result: "Сделано" },
  [`POST /api/mobile/tasks/${ID}/snooze`]: { by: "tomorrow" },
  [`POST /api/mobile/orders/${ID}/status`]: { status: "paid" },
};

describe("ответы Nest байт в байт (эталон — прежний mybook-api): 77 маршрутов старого мобильного CRM и раздачи приложений (Контекст 6)", () => {
  it("список маршрутов — 77, без повторов", () => {
    expect(ROUTES).toHaveLength(77);
    expect(new Set(ROUTES.map(([m, u]) => `${m} ${u}`)).size).toBe(77);
  });

  for (const [who, headers] of [
    ["без входа", {}],
    ["клиент (не сотрудник)", asRegular],
    ["сотрудник без прав", asNoPerms],
  ] as const) {
    it(`${who}: ответ каждого маршрута совпадает байт в байт`, async () => {
      const failed: string[] = [];
      for (const [method, url] of ROUTES) {
        try {
          await assertRoute({ nest: app, method, url, headers, body: bodyFor(method) });
        } catch (err) {
          failed.push(String(err instanceof Error ? err.message : err).split("\n")[0]);
        }
      }
      expect(failed).toEqual([]);
    });
  }

  it("руководитель: ответ каждого маршрута совпадает байт в байт", async () => {
    const failed: string[] = [];
    const statuses: string[] = [];
    for (const [method, url] of ROUTES) {
      const key = `${method} ${url}`;
      try {
        const r = await assertRoute({ nest: app, method, url, headers: asOwner, body: BODIES[key] ?? bodyFor(method) });
        statuses.push(`${key} → ${r.nestRes.statusCode}`);
      } catch (err) {
        failed.push(String(err instanceof Error ? err.message : err).split("\n")[0]);
      }
    }
    expect(failed).toEqual([]);
    // 5xx — только у маршрутов с файлом, куда здесь ушёл JSON вместо multipart (обе стороны одинаково); с файлом — тест ниже.
    expect(statuses.filter((x) => / → 5\d\d$/.test(x)).map((x) => x.split(" → ")[0])).toEqual([
      "POST /api/admin/mobile-apk",
      `POST /api/mobile/chats/${ID}/voice`,
    ]);
  });

  it("файлы: APK (скачать и загрузить), аудио сообщения с правами по сделке, голосовое — байт в байт", async () => {
    // APK: нет файла → 404, есть → сам файл; загрузка — не APK, не .apk, пусто и успешная, сотрудник без права — 403.
    await assertRoute({ nest: app, method: "GET", url: "/api/admin/mobile-apk", headers: asOwner });
    shared.apkPresent = true;
    await assertRoute({ nest: app, method: "GET", url: "/api/admin/mobile-apk", headers: asOwner });
    for (const [name, data] of [
      ["crm.apk", Buffer.from("PK\x03\x04apk-bytes")],
      ["crm.apk", Buffer.from("not an apk")],
      ["crm.zip", Buffer.from("PK\x03\x04apk-bytes")],
    ] as const) {
      const mp = multipartFile("apk", name, "application/vnd.android.package-archive", data);
      await assertRoute({ nest: app, method: "POST", url: "/api/admin/mobile-apk", headers: { ...asOwner, ...mp.headers }, body: mp.body });
    }
    const apk = multipartFile("apk", "crm.apk", "application/vnd.android.package-archive", Buffer.from("PK\x03\x04apk-bytes"));
    await assertRoute({ nest: app, method: "POST", url: "/api/admin/mobile-apk", headers: { ...asSales, ...apk.headers }, body: apk.body });

    // Аудио: свой диалог, чужой диалог по своей сделке нет (сделка руководителя) → 403, нет сообщения → 404.
    const audio = `/api/mobile/chats/messages/${MSG_ID}/audio`;
    await assertRoute({ nest: app, method: "GET", url: audio, headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: audio, headers: asSales });
    shared.chatAssigneeId = OWNER.id;
    await assertRoute({ nest: app, method: "GET", url: audio, headers: asSales });
    await assertRoute({ nest: app, method: "GET", url: `/api/mobile/chats/messages/${TASK_ID}/audio`, headers: asOwner });
    shared.chatAssigneeId = SALES.id;

    // Голосовое: перекодировано, без ffmpeg — как есть, пустая запись, чужой диалог.
    const voice = multipartFile("voice", "clip.m4a", "audio/mp4", Buffer.from("voice-bytes"));
    const voiceUrl = `/api/mobile/chats/${CHAT_ID}/voice`;
    await assertRoute({ nest: app, method: "POST", url: voiceUrl, headers: { ...asSales, ...voice.headers }, body: voice.body });
    shared.convertVoiceOk = false;
    await assertRoute({ nest: app, method: "POST", url: voiceUrl, headers: { ...asSales, ...voice.headers }, body: voice.body });
    const empty = multipartFile("voice", "clip.m4a", "audio/mp4", Buffer.alloc(0));
    await assertRoute({ nest: app, method: "POST", url: voiceUrl, headers: { ...asSales, ...empty.headers }, body: empty.body });
    shared.chatAssigneeId = OWNER.id;
    await assertRoute({ nest: app, method: "POST", url: voiceUrl, headers: { ...asSales, ...voice.headers }, body: voice.body });
  });
});
