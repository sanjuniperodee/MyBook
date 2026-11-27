import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, beforeEach, describe, it, vi } from "vitest";
import type { Output } from "@mybook/contracts";
import { StaffContext } from "@/modules/access/domain/StaffContext";
import { isPhoneEmail } from "@/modules/identity";
import type { BotTurnTrace } from "@/modules/messaging/domain/botTrace";
import { ReceiptUsedError } from "@/modules/sales";
import { allPermissions, type Permission, type RoleScope } from "@/shared/domain/permissions";
import type { CrmField } from "@/shared/infrastructure/db/schema";
import { STAFF_ACCESS, type StaffAccessPort } from "../src/core/auth/staff";
import {
  legacyCrmChatsPorts,
  legacyCrmClientsPorts,
  legacyCrmDealsPorts,
  legacyCrmListsPorts,
} from "../src/legacy/crm-core.ports";
import {
  CRM_CHATS_PORTS,
  CRM_CLIENTS_PORTS,
  CRM_DEALS_PORTS,
  CRM_LISTS_PORTS,
} from "../src/modules/crm-core/crm-core.tokens";
import { bootTestApp, sessionOf, testUser } from "./app";

const OWNER = testUser("11111111-1111-4111-8111-111111111111", { name: "Руководитель", role: "admin" });
const OWN_MGR = testUser("22222222-2222-4222-8222-222222222222", { name: "Менеджер Свои", role: "admin" });
const VIEWER = testUser("33333333-3333-4333-8333-333333333333", { name: "Наблюдатель", role: "admin" });
const REGULAR = testUser("55555555-5555-4555-8555-555555555555", { name: "Клиент", role: "user" });
const ALL_USERS = [OWNER, OWN_MGR, VIEWER, REGULAR];

const DEAL_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_DEAL_ID = "aaaaaaaa-aaaa-4aaa-8aaa-bbbbbbbbbbbb";
const CLIENT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_CLIENT_ID = "cccccccc-cccc-4ccc-8ccc-dddddddddddd";
const CHAT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const OTHER_CHAT_ID = "eeeeeeee-eeee-4eee-8eee-ffffffffffff";
const MSG_ID = "12121212-1212-4121-8121-121212121212";
const ORDER_ID = "34343434-3434-4343-8343-343434343434";
const PIPELINE_1 = "56565656-5656-4565-8565-565656565656";
const PIPELINE_2 = "78787878-7878-4787-8787-787878787878";
const STAGE_1 = "90909090-9090-4909-8909-909090909090";
const PAYMENT_ID = "abababab-abab-4aba-8aba-abababababab";

const PROFILES: Record<string, { name: string; key: string | null; scope: RoleScope; perms: Permission[]; owner: boolean }> = {
  [OWNER.id]: { name: "Руководитель", key: "owner", scope: "all", perms: [...allPermissions], owner: true },
  [OWN_MGR.id]: {
    name: "Менеджер",
    key: "manager",
    scope: "own",
    perms: ["deals.view", "deals.edit", "clients.view", "clients.create", "clients.edit", "chats.view", "chats.send", "calls.view", "orders.view"],
    owner: false,
  },
  [VIEWER.id]: { name: "Просмотр", key: "viewer", scope: "all", perms: ["deals.view"], owner: false },
};

const staffCtxFor = (u: typeof OWNER) => {
  if (u.role !== "admin" || u.staffDisabled) return null;
  const p = PROFILES[u.id];
  if (!p) return null;
  return new StaffContext(u.id, p.name, p.key, p.scope, new Set(p.perms), p.owner, { isPhoneEmail });
};

const FIELD_DATE = new Date("2026-10-01T00:00:00Z");

const dealFields: CrmField[] = [
  { id: "f1", entity: "deal", key: "city", label: "Город", type: "text", options: [], position: 0, createdAt: FIELD_DATE, updatedAt: FIELD_DATE },
  { id: "f2", entity: "deal", key: "vip", label: "VIP", type: "checkbox", options: [], position: 1, createdAt: FIELD_DATE, updatedAt: FIELD_DATE },
];

const clientFields: CrmField[] = [
  { id: "cf1", entity: "client", key: "hobby", label: "Хобби", type: "text", options: [], position: 0, createdAt: FIELD_DATE, updatedAt: FIELD_DATE },
];

const ownDeal = {
  id: DEAL_ID,
  number: 42,
  title: "Книга для мамы",
  stageId: STAGE_1,
  clientId: null,
  orderId: null,
  amount: 29000,
  source: "whatsapp" as const,
  contactName: "Алия",
  contactPhone: "+77015551122",
  contactEmail: "aliya@example.kz",
  extraPhones: ["+77015553344"],
  tags: ["срочно"],
  customFields: { city: "Алматы", vip: true },
  assigneeId: OWN_MGR.id,
  unsorted: false,
  lostReason: null,
  utm: null,
  stageChangedAt: new Date("2026-11-20T10:00:00Z"),
  closedAt: null,
  createdAt: new Date("2026-11-19T10:00:00Z"),
  updatedAt: new Date("2026-11-20T10:00:00Z"),
};

const otherDeal = { ...ownDeal, id: OTHER_DEAL_ID, number: 43, assigneeId: OWNER.id };

const ownClient = {
  id: CLIENT_ID,
  role: "user",
  managerId: OWN_MGR.id,
  name: "Алия",
  email: "aliya@example.kz",
  phone: "+77015551122",
  extraPhones: ["+77019998877"],
  tags: ["vip"],
  customFields: { hobby: "Чтение" },
  locale: "ru",
  source: { utmSource: "instagram" },
};

const otherClient = { ...ownClient, id: OTHER_CLIENT_ID, managerId: OWNER.id };

const traceSample: BotTurnTrace = {
  v: 1,
  purpose: "reply",
  model: { action: "reply", stage: "offer", handoff: "none", lang: "ru", summary: "Предложил твёрдую обложку" },
  result: { phase: "active", outcome: null, handoff: null },
  fields: { plan: "hardcover" },
  deadline: null,
  materials: null,
  notes: [],
  lessons: [],
  knowledge: null,
  tokens: null,
};

const todayFixture: Output<"crmToday"> = {
  counts: { tasks: 1, overdueTasks: 0, waiting: 1, missed: 0, unsorted: 0, openDeals: 2, openDealsSum: 58000, noNextStep: 0 },
  plan: { planAmount: 300000, factAmount: 58000, planDeals: 10, factDeals: 2 },
  tasks: [],
  waiting: [],
  missed: [],
};

const clientCardFixture: Output<"crmClientCard"> = {
  id: CLIENT_ID,
  name: "Алия",
  phone: "+7 701 555 11 22",
  email: "aliya@example.kz",
  tags: ["vip"],
  manager: "Менеджер Свои",
  lastSeenAt: null,
  createdAt: "2026-11-01T10:00:00.000Z",
  money: { total: 29000, sales: 1 },
  canWrite: true,
  books: [],
  orders: [],
  deals: [],
  tasks: [],
  notes: [],
};

const chatDetailFixture: Output<"crmChatGet"> = {
  conversation: {
    pinned: false,
    id: CHAT_ID,
    title: "Алия",
    channel: "whatsapp",
    channelLabel: "WhatsApp",
    avatarUrl: null,
    status: "open",
    unread: 2,
    assigneeId: OWN_MGR.id,
    assignee: "Менеджер Свои",
    dealId: DEAL_ID,
    clientId: CLIENT_ID,
    clientName: "Алия",
  },
  messages: [],
  more: false,
  deal: null,
  perms: { canReply: true, canNote: true, canInvoice: true, canEditInvoices: true, canCreateDeal: true, mine: true },
  sendBlocker: null,
  bot: { label: null, canStart: true, canStop: false },
  templates: [],
  invoices: [],
};

const dealDetailFixture: Output<"crmDealGet"> = {
  id: DEAL_ID,
  number: 42,
  title: "Книга для мамы",
  contactName: "Алия",
  phone: "+7 701 555 11 22",
  amount: 29000,
  paid: 0,
  source: "WhatsApp",
  stage: { id: STAGE_1, name: "В работе", color: "#3b82f6", kind: "open" },
  stages: [{ id: STAGE_1, name: "В работе", color: "#3b82f6", kind: "open" }],
  assigneeId: OWN_MGR.id,
  assignee: "Менеджер Свои",
  unsorted: false,
  tags: ["срочно"],
  customFields: {},
  createdAt: "2026-11-19T10:00:00.000Z",
  perms: { canEdit: true, canMove: true, canInvoice: true, mine: true },
  maxDiscountPercent: 15,
  chatId: CHAT_ID,
  client: { id: CLIENT_ID, name: "Алия" },
  order: null,
  tasks: [],
  notes: [],
  payments: [],
  payForms: ["Kaspi Gold"],
  hasOrder: false,
  invoices: [],
};

const orderDetailFixture: Output<"crmOrder"> = {
  id: ORDER_ID,
  number: 105,
  status: "paid",
  statusLabel: "Оплачен",
  canEdit: true,
  planName: "Твёрдая обложка",
  printed: true,
  quantity: 1,
  amountLabel: "29 000 ₸",
  addons: [],
  book: { title: "Мама", author: "Алия", recipient: "Мама" },
  contact: { name: "Алия", phone: "+77015551122", email: "aliya@example.kz", masked: false },
  delivery: { method: "Курьер", quoted: false, address: "Алматы" },
  tracking: null,
  desiredDate: null,
  comment: null,
  giftNote: null,
  surprise: false,
  claimed: false,
  events: [],
};

const state = vi.hoisted(() => ({
  receiptDuplicate: false,
  pipelineError: false,
  updateDealError: null as string | null,
  deleteDealError: null as string | null,
}));

// В изолированном worktree `node_modules` может быть симлинком на другой worktree, поэтому берём локальный `@mybook/contracts`.
vi.mock("@mybook/contracts", () => import("../../../packages/contracts/src/index"));
vi.mock("next/headers", () => import("../../../apps/api/src/http/next-shim"));
vi.mock("next/server", () => import("../../../apps/api/src/http/next-shim"));
vi.mock("next/navigation", () => import("../../../apps/api/src/http/next-shim"));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/rateLimit", () => ({ trustedClientIp: async () => "203.0.113.10" }));

vi.mock("@/server/auth", async () => {
  const { legacyRequestContext } = await import("@/server/request-context");
  const shim = await import("../../../apps/api/src/http/next-shim");
  return {
    getCurrentUser: async () => {
      const ctx = legacyRequestContext();
      if (ctx) return ctx.user;
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
  const { legacyRequestContext } = await import("@/server/request-context");
  const FORBIDDEN = Symbol.for("mybook.forbidden-error");
  class MockForbiddenError extends Error {
    readonly [FORBIDDEN] = true;
    static is(err: unknown): err is MockForbiddenError {
      return typeof err === "object" && err !== null && Reflect.get(err, FORBIDDEN) === true;
    }
  }
  const getStaff = async () => {
    const ctx = legacyRequestContext();
    if (ctx) return ctx.staff;
    const u = await getCurrentUser();
    if (!u) return null;
    const context = staffCtxFor(u);
    if (!context) return null;
    return { user: u, roleName: context.roleName, roleKey: context.roleKey, scope: context.scope, permissions: context.permissions, isOwner: context.isOwner, context };
  };
  return {
    ForbiddenError: MockForbiddenError,
    getStaff,
    assertStaff: async (...perms: Permission[]) => {
      const staff = await getStaff();
      if (!staff || !staff.context.can(...perms)) throw new MockForbiddenError();
      return staff;
    },
    can: (staff: { context: StaffContext } | null, ...perms: Permission[]) => Boolean(staff?.context.can(...perms)),
    canWork: (staff: { context: StaffContext }, assigneeId: string | null | undefined) => staff.context.canWork(assigneeId),
    canAssignOthers: (staff: { context: StaffContext }) => staff.context.canAssignOthers,
    assertVisible: (staff: { context: StaffContext }, assigneeId: string | null | undefined) => {
      if (!staff.context.canSee(assigneeId)) throw new MockForbiddenError();
    },
  };
});

vi.mock("@/modules/workspace", () => ({
  listFields: async (entity: "deal" | "client") => (entity === "deal" ? dealFields : clientFields),
  staffNotifications: async () => [
    { id: MSG_ID, kind: "deal", title: "Новая сделка", body: "Д42", link: `/admin/deals/${DEAL_ID}`, read: false, at: "2026-11-25T10:00:00.000Z" },
  ],
}));

vi.mock("@/server/discount", () => ({
  discountLimit: async (staff: { isOwner: boolean }) => (staff.isOwner ? null : 15),
}));

vi.mock("@/server/pay-form", () => ({
  payFormOptions: async () => ["Kaspi Gold", "Перевод"],
}));

vi.mock("@/server/crm-lists/work", () => ({
  mobileToday: async () => todayFixture,
  mobileTasks: async () => [],
  mobileCalls: async () => ({ stats: { total: 2, answered: 1, missed: 1, talk: 45 }, calls: [] }),
  mobileClients: async () => ({ total: 1, page: 1, pageSize: 40, clients: [] }),
  mobileClient: async () => clientCardFixture,
  mobileStaff: async (staff: { context: StaffContext }) => ({
    canAssignOthers: staff.context.canAssignOthers,
    staff: [{ id: OWNER.id, name: "Руководитель" }],
  }),
}));

vi.mock("@/server/crm-lists/orders", () => ({
  mobileOrders: async () => ({ canEdit: true, statuses: [{ key: "paid", label: "Оплачен" }], orders: [] }),
  mobileOrder: async () => orderDetailFixture,
}));

vi.mock("@/server/crm-lists/data", () => ({
  mobileChatList: async () => [],
  mobileChatDetail: async () => chatDetailFixture,
  mobileMessages: async () => ({ messages: [], more: false }),
  mobileDeals: async () => ({ pipelines: [{ id: PIPELINE_1, name: "Основная" }], pipeline: { id: PIPELINE_1, name: "Основная" }, stages: [], deals: [] }),
  mobileDealDetail: async () => dealDetailFixture,
}));

vi.mock("@/server/crm-actions/deals", () => ({
  updateDealAction: async () => (state.updateDealError ? { error: state.updateDealError } : { ok: "Сохранено" }),
  setDealAgreedPlanAction: async (_id: string, plan: string | null) =>
    plan === "bad" ? { ok: false, message: "Неизвестный тариф" } : { ok: true },
  setDealAgreedGiftsAction: async (_id: string, gifts: string[]) =>
    gifts.includes("bad") ? { ok: false, message: "Подарок недоступен" } : { ok: true },
  createClientFromDealAction: async (_dealId: string, _prev: unknown, form: FormData) =>
    form.get("channel") === "bad"
      ? { error: "Неверный канал" }
      : { done: { clientId: CLIENT_ID, loginText: "+77015551122", password: "pw1", message: "Готово" } },
  linkDealClientAction: async () => ({ ok: true }),
  mergeDealAction: async (_t: string, s: string) => (s === DEAL_ID ? { error: "Нельзя слить с собой" } : undefined),
  movePipelineAction: async () => {
    if (state.pipelineError) throw new Error("В воронке нет этапов «в работе»");
  },
  deleteDealAction: async () => {
    if (state.deleteDealError) return { error: state.deleteDealError };
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/admin/deals;307;" });
  },
}));

vi.mock("@/server/crm-actions/clients-new", () => ({
  issueClientAccessAction: async (id: string) =>
    id === OTHER_CLIENT_ID
      ? { error: "Это клиент другого менеджера" }
      : { loginText: "+77015551122", password: "pw2", message: "Доступ" },
  createClientAction: async (_prev: unknown, form: FormData) =>
    form.get("channel") === "bad"
      ? { error: "Укажите канал продаж" }
      : {
          done: {
            clientId: CLIENT_ID,
            clientName: String(form.get("name") ?? "Алия"),
            dealId: DEAL_ID,
            dealNumber: 42,
            paymentId: PAYMENT_ID,
            parts: [{ dealId: DEAL_ID, dealNumber: 42, agreed: 29000, prepaid: 10000, paymentId: PAYMENT_ID }],
            count: 1,
            loginText: "+77015551122",
            password: "pw3",
            loginUrl: "http://localhost:3000/login",
            message: "Доступ",
            agreed: 29000,
            prepaid: 10000,
            remainder: 19000,
            tasks: 1,
          },
        },
}));

vi.mock("@/server/crm-actions/admin", () => ({
  remindClientAction: async (id: string) =>
    id === OTHER_CLIENT_ID ? { ok: false, message: "У клиента нет почты" } : { ok: true, message: "Напоминание отправлено" },
  updateClientTagsAction: async () => {},
}));

vi.mock("@/server/crm-actions/crm", () => ({
  setClientPhonesAction: async () => ({ ok: true, message: "Сохранено номеров: 1" }),
  setClientFieldsAction: async () => ({ ok: "Сохранено" }),
  setClientNoMarketingAction: async () => ({ ok: true, message: "Не пишем первыми" }),
  setClientLocaleAction: async (_id: string, loc: string) =>
    loc === "zz" ? { ok: false, message: "Выберите язык" } : { ok: true, message: "Язык: казахский" },
  setClientChannelAction: async () => ({ ok: true, message: "Канал: Instagram" }),
  setClientManagerAction: async () => ({ ok: true }),
}));

vi.mock("@/server/crm-actions/chats", () => ({
  botTraceAction: async (_chatId: string, msgId: string) =>
    msgId === MSG_ID ? { trace: traceSample } : { error: "След хода не найден" },
  startBotAction: async () => {},
  stopBotAction: async () => {},
  sendOfferAction: async (_chatId: string, req: { kind: string }) =>
    req.kind === "order" ? { ok: true, message: "Отправлено" } : { ok: false, message: "Нет активной книги" },
}));

const mockContainer = {
  workspace: { inbox: { markRead: vi.fn(async () => {}) } },
  messaging: {
    queries: {
      conversation: async (id: string) => {
        if (id === CHAT_ID) return { id: CHAT_ID, assigneeId: OWN_MGR.id, clientId: CLIENT_ID, unread: 2, status: "open" };
        if (id === OTHER_CHAT_ID) return { id: OTHER_CHAT_ID, assigneeId: OWNER.id, clientId: OTHER_CLIENT_ID, unread: 0, status: "open" };
        return null;
      },
    },
    chats: { noMarketingFor: async () => false },
    botTraces: async () => [{ id: MSG_ID, at: new Date("2026-11-25T10:00:00Z"), messageId: null, trace: traceSample }],
  },
  marketing: {
    service: {
      chatOffers: async (_clientId: string | null, canPromo: boolean) => ({
        order: { number: 105 },
        book: { title: "Мама" },
        maxDiscount: canPromo ? 12 : 0,
      }),
    },
  },
  sales: {
    deals: {
      findById: async (id: string) => (id === DEAL_ID ? ownDeal : id === OTHER_DEAL_ID ? otherDeal : null),
      findClientByPhone: async () => null,
    },
    agreedPlan: { get: async () => "hardcover" },
    agreedGifts: { get: async () => ["giftwrap"] },
    queries: {
      duplicates: async () => ({
        open: [
          {
            deal: { id: DEAL_ID, number: 50, title: "Дубль", amount: 25000, closedAt: null, createdAt: new Date("2026-11-10T10:00:00Z"), assigneeId: OWN_MGR.id },
            stage: { name: "В работе" },
          },
          {
            deal: { id: OTHER_DEAL_ID, number: 51, title: "Чужой дубль", amount: 25000, closedAt: null, createdAt: new Date("2026-11-11T10:00:00Z"), assigneeId: OWNER.id },
            stage: { name: "В работе" },
          },
        ],
        past: [],
      }),
      listPipelines: async () => [
        { id: PIPELINE_1, name: "Основная" },
        { id: PIPELINE_2, name: "Повторные" },
      ],
      listStages: async () => [{ id: STAGE_1, name: "Взяли в работу", kind: "open", pipelineId: PIPELINE_1 }],
    },
    intake: {
      attachReceipt: async () => {
        if (state.receiptDuplicate) throw new ReceiptUsedError("receiptUsed", "Чек уже приложен к сделке Д10");
        return {
          id: "rec-1",
          fileName: "receipt.jpg",
          amount: 10000,
          mime: "image/jpeg",
          size: 10,
          createdAt: new Date("2026-11-25T10:00:00Z"),
        };
      },
    },
  },
  reporting: {
    dealById: async (id: string) => (id === DEAL_ID ? ownDeal : id === OTHER_DEAL_ID ? otherDeal : null),
    clientById: async (id: string) => (id === CLIENT_ID ? ownClient : id === OTHER_CLIENT_ID ? otherClient : null),
    clientBrief: async () => null,
  },
  access: {
    queries: {
      allStaff: async () => [
        { id: OWNER.id, name: "Руководитель", email: OWNER.email, disabled: false },
        { id: OWN_MGR.id, name: "Менеджер Свои", email: OWN_MGR.email, disabled: false },
      ],
    },
  },
};

vi.mock("@/server/container", () => ({ container: () => mockContainer }));

const { assertRouteParity, createLegacyTestApp } = await import("./parity");
const { HttpError } = await import("@/server/api");

const staffAccess: StaffAccessPort = {
  async resolve(user) {
    const context = staffCtxFor(user);
    return context ? { context, gate: null } : null;
  },
};

const as = (u: typeof OWNER) => ({ cookie: `mb_session=${sessionOf(u)}` });
const bearer = (u: typeof OWNER) => ({ authorization: `Bearer ${sessionOf(u)}` });

function multipartReceipt() {
  const boundary = "----parityReceiptBoundary";
  const body = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="receipt.jpg"\r\nContent-Type: image/jpeg\r\n\r\njpeg-bytes\r\n--${boundary}--\r\n`,
  );
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

let app: NestFastifyApplication;
let legacy: ReturnType<typeof createLegacyTestApp>;

beforeAll(async () => {
  // Подключаем НАСТОЯЩИЕ адаптеры `apps/backend/src/legacy/crm-core.ports.ts` (через `runInLegacyRequest` и `toLegacyStaff`),
  // чтобы одновременно проверить побайтовый паритет всех 37 маршрутов и отсутствие обращений к `next/headers` в NestJS.
  const factoryOf = <T>(provider: unknown) => (provider as { useFactory: (c: unknown) => T }).useFactory(mockContainer);
  ({ app } = await bootTestApp({
    users: ALL_USERS,
    overrides: [
      [STAFF_ACCESS, staffAccess],
      [CRM_LISTS_PORTS, factoryOf(legacyCrmListsPorts)],
      [CRM_DEALS_PORTS, factoryOf(legacyCrmDealsPorts)],
      [CRM_CLIENTS_PORTS, factoryOf(legacyCrmClientsPorts)],
      [CRM_CHATS_PORTS, factoryOf(legacyCrmChatsPorts)],
    ],
  }));
  legacy = createLegacyTestApp({
    users: ALL_USERS,
    staff: async (user) => {
      if (!staffCtxFor(user)) throw new HttpError(403, "forbidden");
    },
  });
});

afterAll(() => app.close());

beforeEach(() => {
  state.receiptDuplicate = false;
  state.pipelineError = false;
  state.updateDealError = null;
  state.deleteDealError = null;
});

describe("побайтовый паритет NestJS ↔ mybook-api: Контекст 4A (все 37 маршрутов CRM-1)", () => {
  it("15 маршрутов crm-lists (200 + ETag/304 + права + 403/404/400/405)", async () => {
    const getUrls = [
      "/api/v1/crm/today",
      "/api/v1/crm/tasks?done=1&who=all&kind=call&q=test",
      "/api/v1/crm/calls?f=missed&days=7",
      "/api/v1/crm/clients?q=ali&sort=ltv&page=1&mine=1",
      `/api/v1/crm/clients/${CLIENT_ID}`,
      "/api/v1/crm/staff",
      "/api/v1/crm/notifications?limit=20",
      "/api/v1/crm/chats?f=open&q=test",
      `/api/v1/crm/chats/${CHAT_ID}?limit=30`,
      `/api/v1/crm/chats/${CHAT_ID}/messages?limit=25&before=2026-11-25T10:00:00.000Z`,
      "/api/v1/crm/deals?mine=1&q=mama",
      `/api/v1/crm/deals/${DEAL_ID}`,
      "/api/v1/crm/orders",
      `/api/v1/crm/orders/${ORDER_ID}`,
    ];
    for (const url of getUrls) {
      await assertRouteParity({ nest: app, legacy, method: "GET", url, headers: as(OWNER) });
    }
    await assertRouteParity({ nest: app, legacy, method: "POST", url: "/api/v1/crm/notifications/read", headers: as(OWNER), body: { id: MSG_ID } });
    // Права и видимость scope: own
    await assertRouteParity({ nest: app, legacy, method: "GET", url: `/api/v1/crm/chats/${OTHER_CHAT_ID}/messages`, headers: as(OWN_MGR) });
    await assertRouteParity({ nest: app, legacy, method: "GET", url: `/api/v1/crm/chats/${ORDER_ID}/messages`, headers: as(OWNER) });
    await assertRouteParity({ nest: app, legacy, method: "GET", url: "/api/v1/crm/calls", headers: as(VIEWER) });
    await assertRouteParity({ nest: app, legacy, method: "GET", url: "/api/v1/crm/today" });
    await assertRouteParity({ nest: app, legacy, method: "GET", url: "/api/v1/crm/today", headers: as(REGULAR) });
    await assertRouteParity({ nest: app, legacy, method: "DELETE", url: "/api/v1/crm/today", headers: as(OWNER) });
  });

  it("10 маршрутов crm/deals + crm/deal-extras (200, 400 refused, 403, 404 чужой/нет)", async () => {
    await assertRouteParity({ nest: app, legacy, method: "GET", url: `/api/v1/crm/deals/${DEAL_ID}/form`, headers: as(OWNER) });
    await assertRouteParity({ nest: app, legacy, method: "GET", url: `/api/v1/crm/deals/${DEAL_ID}/form`, headers: as(OWN_MGR) });
    await assertRouteParity({ nest: app, legacy, method: "GET", url: `/api/v1/crm/deals/${OTHER_DEAL_ID}/form`, headers: as(OWN_MGR) });

    await assertRouteParity({
      nest: app,
      legacy,
      method: "PATCH",
      url: `/api/v1/crm/deals/${DEAL_ID}`,
      headers: as(OWNER),
      body: { title: "Обновлённая сделка", fields: { city: "Астана", vip: "false" } },
    });
    state.updateDealError = "Скидка выше лимита";
    await assertRouteParity({ nest: app, legacy, method: "PATCH", url: `/api/v1/crm/deals/${DEAL_ID}`, headers: as(OWNER), body: { amount: 1000 } });
    state.updateDealError = null;

    await assertRouteParity({ nest: app, legacy, method: "PUT", url: `/api/v1/crm/deals/${DEAL_ID}/plan`, headers: as(OWNER), body: { plan: "hardcover" } });
    await assertRouteParity({ nest: app, legacy, method: "PUT", url: `/api/v1/crm/deals/${DEAL_ID}/plan`, headers: as(OWNER), body: { plan: "bad" } });

    await assertRouteParity({ nest: app, legacy, method: "PUT", url: `/api/v1/crm/deals/${DEAL_ID}/gifts`, headers: as(OWNER), body: { gifts: ["giftwrap"] } });
    await assertRouteParity({ nest: app, legacy, method: "PUT", url: `/api/v1/crm/deals/${DEAL_ID}/gifts`, headers: as(OWNER), body: { gifts: ["bad"] } });

    await assertRouteParity({ nest: app, legacy, method: "GET", url: `/api/v1/crm/deals/${DEAL_ID}/extras`, headers: as(OWN_MGR) });
    await assertRouteParity({ nest: app, legacy, method: "GET", url: `/api/v1/crm/deals/${OTHER_DEAL_ID}/extras`, headers: as(OWN_MGR) });

    await assertRouteParity({
      nest: app,
      legacy,
      method: "POST",
      url: `/api/v1/crm/deals/${DEAL_ID}/client`,
      headers: as(OWNER),
      body: { name: "Алия", email: "aliya@example.kz", locale: "ru", channel: "instagram" },
    });
    await assertRouteParity({
      nest: app,
      legacy,
      method: "POST",
      url: `/api/v1/crm/deals/${DEAL_ID}/client`,
      headers: as(OWNER),
      body: { name: "Алия", email: "", locale: "ru", channel: "bad" },
    });

    await assertRouteParity({ nest: app, legacy, method: "PUT", url: `/api/v1/crm/deals/${DEAL_ID}/client`, headers: as(OWNER), body: { clientId: CLIENT_ID } });
    await assertRouteParity({ nest: app, legacy, method: "PUT", url: `/api/v1/crm/deals/${DEAL_ID}/client`, headers: as(OWNER), body: { clientId: null } });

    await assertRouteParity({ nest: app, legacy, method: "POST", url: `/api/v1/crm/deals/${DEAL_ID}/merge`, headers: as(OWNER), body: { sourceId: OTHER_DEAL_ID } });
    await assertRouteParity({ nest: app, legacy, method: "POST", url: `/api/v1/crm/deals/${DEAL_ID}/merge`, headers: as(OWNER), body: { sourceId: DEAL_ID } });

    await assertRouteParity({ nest: app, legacy, method: "PUT", url: `/api/v1/crm/deals/${DEAL_ID}/pipeline`, headers: as(OWNER), body: { pipelineId: PIPELINE_2 } });
    state.pipelineError = true;
    await assertRouteParity({ nest: app, legacy, method: "PUT", url: `/api/v1/crm/deals/${DEAL_ID}/pipeline`, headers: as(OWNER), body: { pipelineId: PIPELINE_2 } });
    state.pipelineError = false;

    await assertRouteParity({ nest: app, legacy, method: "DELETE", url: `/api/v1/crm/deals/${DEAL_ID}`, headers: as(OWNER) });
    state.deleteDealError = "По сделке приняты деньги";
    await assertRouteParity({ nest: app, legacy, method: "DELETE", url: `/api/v1/crm/deals/${DEAL_ID}`, headers: as(OWNER) });
    await assertRouteParity({ nest: app, legacy, method: "DELETE", url: `/api/v1/crm/deals/${DEAL_ID}`, headers: as(OWN_MGR) });
  });

  it("7 маршрутов crm/clients + crm/new-client + crmDealReceipt (200, 400 refused, 403, 404, 409)", async () => {
    await assertRouteParity({ nest: app, legacy, method: "POST", url: `/api/v1/crm/clients/${CLIENT_ID}/access`, headers: as(OWNER) });
    await assertRouteParity({ nest: app, legacy, method: "POST", url: `/api/v1/crm/clients/${OTHER_CLIENT_ID}/access`, headers: as(OWNER) });

    await assertRouteParity({ nest: app, legacy, method: "POST", url: `/api/v1/crm/clients/${CLIENT_ID}/remind`, headers: as(OWNER) });
    await assertRouteParity({ nest: app, legacy, method: "POST", url: `/api/v1/crm/clients/${OTHER_CLIENT_ID}/remind`, headers: as(OWNER) });

    await assertRouteParity({ nest: app, legacy, method: "GET", url: `/api/v1/crm/clients/${CLIENT_ID}/form`, headers: as(OWN_MGR) });
    await assertRouteParity({ nest: app, legacy, method: "GET", url: `/api/v1/crm/clients/${OTHER_CLIENT_ID}/form`, headers: as(OWN_MGR) });

    await assertRouteParity({
      nest: app,
      legacy,
      method: "PATCH",
      url: `/api/v1/crm/clients/${CLIENT_ID}`,
      headers: as(OWNER),
      body: { tags: ["vip"], fields: { hobby: "Кино" }, noMarketing: true, locale: "kk", channel: "instagram", managerId: OWN_MGR.id },
    });
    await assertRouteParity({ nest: app, legacy, method: "PATCH", url: `/api/v1/crm/clients/${CLIENT_ID}`, headers: as(OWNER), body: { locale: "zz" } });

    await assertRouteParity({ nest: app, legacy, method: "GET", url: "/api/v1/crm/clients/new", headers: as(OWN_MGR) });
    await assertRouteParity({
      nest: app,
      legacy,
      method: "POST",
      url: "/api/v1/crm/clients",
      headers: as(OWNER),
      body: {
        name: "Алия",
        phone: "+77015551122",
        channel: "instagram",
        deal: { plan: "hardcover", count: 1, agreed: 29000, prepaid: 10000, gifts: ["giftwrap"] },
      },
    });
    await assertRouteParity({
      nest: app,
      legacy,
      method: "POST",
      url: "/api/v1/crm/clients",
      headers: as(OWNER),
      body: { name: "Алия", phone: "+77015551122", channel: "bad" },
    });

    const mp = multipartReceipt();
    await assertRouteParity({
      nest: app,
      legacy,
      method: "POST",
      url: `/api/v1/crm/deals/${DEAL_ID}/receipts?amount=10000&paymentId=${PAYMENT_ID}`,
      headers: { ...bearer(OWNER), "content-type": mp.contentType },
      body: mp.body,
    });
    state.receiptDuplicate = true;
    await assertRouteParity({
      nest: app,
      legacy,
      method: "POST",
      url: `/api/v1/crm/deals/${DEAL_ID}/receipts?amount=10000`,
      headers: { ...bearer(OWNER), "content-type": mp.contentType },
      body: mp.body,
    });
    state.receiptDuplicate = false;
    await assertRouteParity({
      nest: app,
      legacy,
      method: "POST",
      url: `/api/v1/crm/deals/${OTHER_DEAL_ID}/receipts?amount=10000`,
      headers: { ...bearer(OWN_MGR), "content-type": mp.contentType },
      body: mp.body,
    });
    await assertRouteParity({
      nest: app,
      legacy,
      method: "POST",
      url: `/api/v1/crm/deals/${DEAL_ID}/receipts?amount=10000`,
      headers: { ...bearer(VIEWER), "content-type": mp.contentType },
      body: mp.body,
    });
  });

  it("5 маршрутов crm/chats + crm/kp (200, 400 refused, 403, 404 чужой чат)", async () => {
    await assertRouteParity({ nest: app, legacy, method: "GET", url: `/api/v1/crm/chats/${CHAT_ID}/messages/${MSG_ID}/trace`, headers: as(OWN_MGR) });
    await assertRouteParity({ nest: app, legacy, method: "GET", url: `/api/v1/crm/chats/${CHAT_ID}/messages/${ORDER_ID}/trace`, headers: as(OWN_MGR) });

    await assertRouteParity({ nest: app, legacy, method: "GET", url: `/api/v1/crm/chats/${CHAT_ID}/bot/traces`, headers: as(OWN_MGR) });
    await assertRouteParity({ nest: app, legacy, method: "GET", url: `/api/v1/crm/chats/${OTHER_CHAT_ID}/bot/traces`, headers: as(OWN_MGR) });

    await assertRouteParity({ nest: app, legacy, method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/bot`, headers: as(OWN_MGR), body: { run: true } });
    await assertRouteParity({ nest: app, legacy, method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/bot`, headers: as(OWN_MGR), body: { run: false } });
    await assertRouteParity({ nest: app, legacy, method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/bot`, headers: as(VIEWER), body: { run: true } });

    await assertRouteParity({ nest: app, legacy, method: "GET", url: `/api/v1/crm/chats/${CHAT_ID}/offers`, headers: as(OWNER) });
    await assertRouteParity({ nest: app, legacy, method: "GET", url: `/api/v1/crm/chats/${CHAT_ID}/offers`, headers: as(OWN_MGR) });
    await assertRouteParity({ nest: app, legacy, method: "GET", url: `/api/v1/crm/chats/${OTHER_CHAT_ID}/offers`, headers: as(OWN_MGR) });

    await assertRouteParity({ nest: app, legacy, method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/offers`, headers: as(OWN_MGR), body: { kind: "order" } });
    await assertRouteParity({ nest: app, legacy, method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/offers`, headers: as(OWN_MGR), body: { kind: "book" } });
    await assertRouteParity({ nest: app, legacy, method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/offers`, headers: as(OWN_MGR), body: { kind: "discount" } });
  });
});
