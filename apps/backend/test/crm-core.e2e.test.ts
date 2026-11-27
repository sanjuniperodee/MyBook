import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Output } from "@mybook/contracts";
import { StaffContext } from "@/modules/access/domain/StaffContext";
import { isPhoneEmail } from "@/modules/identity";
import type { BotTurnTrace } from "@/modules/messaging/domain/botTrace";
import type { DealView } from "@/modules/sales";
import { allPermissions, type Permission, type RoleScope } from "@/shared/domain/permissions";
import type { CrmField } from "@/shared/infrastructure/db/schema";
import { STAFF_ACCESS, type StaffAccessPort } from "../src/core/auth/staff";
import {
  CRM_CHATS_PORTS,
  CRM_CLIENTS_PORTS,
  CRM_DEALS_PORTS,
  CRM_LISTS_PORTS,
  type CrmChatsPorts,
  type CrmClientRecord,
  type CrmClientsPorts,
  type CrmDealReportingRecord,
  type CrmDealsPorts,
  type CrmListsPorts,
} from "../src/modules/crm-core/crm-core.tokens";
import { bootTestApp, sessionOf, testUser } from "./app";

const OWNER = testUser("11111111-1111-4111-8111-111111111111", { name: "Руководитель", role: "admin" });
const OWN_MGR = testUser("22222222-2222-4222-8222-222222222222", { name: "Менеджер Свои", role: "admin" });
const VIEW_ONLY = testUser("33333333-3333-4333-8333-333333333333", { name: "Наблюдатель", role: "admin" });
const DISABLED = testUser("44444444-4444-4444-8444-444444444444", { name: "Отключённый", role: "admin", staffDisabled: true });
const REGULAR = testUser("55555555-5555-4555-8555-555555555555", { name: "Клиент", role: "user" });

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

const as = (u: typeof OWNER) => ({ cookie: `mb_session=${sessionOf(u)}` });
const bearer = (u: typeof OWNER) => ({ authorization: `Bearer ${sessionOf(u)}` });

const STAFF_PROFILES: Record<string, { name: string; key: string | null; scope: RoleScope; perms: Permission[]; owner: boolean }> = {
  [OWNER.id]: { name: "Руководитель", key: "owner", scope: "all", perms: [...allPermissions], owner: true },
  [OWN_MGR.id]: {
    name: "Менеджер",
    key: "manager",
    scope: "own",
    perms: ["deals.view", "deals.edit", "clients.view", "clients.create", "clients.edit", "chats.view", "chats.send", "calls.view", "orders.view"],
    owner: false,
  },
  [VIEW_ONLY.id]: { name: "Просмотр", key: "viewer", scope: "all", perms: ["deals.view"], owner: false },
};

const staffAccess: StaffAccessPort = {
  async resolve(user) {
    if (user.role !== "admin" || user.staffDisabled) return null;
    const p = STAFF_PROFILES[user.id];
    if (!p) return null;
    return {
      context: new StaffContext(user.id, p.name, p.key, p.scope, new Set(p.perms), p.owner, { isPhoneEmail }),
      gate: null,
    };
  },
};

const FIELD_DATE = new Date("2026-10-01T00:00:00Z");

const dealFieldDefs: CrmField[] = [
  { id: "f1", entity: "deal", key: "city", label: "Город", type: "text", options: [], position: 0, createdAt: FIELD_DATE, updatedAt: FIELD_DATE },
  { id: "f2", entity: "deal", key: "vip", label: "VIP", type: "checkbox", options: [], position: 1, createdAt: FIELD_DATE, updatedAt: FIELD_DATE },
];

const clientFieldDefs: CrmField[] = [
  { id: "cf1", entity: "client", key: "hobby", label: "Хобби", type: "text", options: [], position: 0, createdAt: FIELD_DATE, updatedAt: FIELD_DATE },
  { id: "cf2", entity: "client", key: "gift", label: "Подарок", type: "checkbox", options: [], position: 1, createdAt: FIELD_DATE, updatedAt: FIELD_DATE },
];

const ownDeal: DealView = {
  id: DEAL_ID,
  number: 42,
  title: "Книга для мамы",
  stageId: STAGE_1,
  clientId: null,
  orderId: null,
  amount: 29000,
  source: "whatsapp",
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
} as unknown as DealView;

const otherDeal: DealView = { ...ownDeal, id: OTHER_DEAL_ID, number: 43, assigneeId: OWNER.id };

const ownDealReport: CrmDealReportingRecord = {
  id: DEAL_ID,
  clientId: null,
  contactPhone: "+77015551122",
  contactEmail: "aliya@example.kz",
  extraPhones: ["+77015553344"],
  assigneeId: OWN_MGR.id,
  stageId: STAGE_1,
};

const otherDealReport: CrmDealReportingRecord = { ...ownDealReport, id: OTHER_DEAL_ID, assigneeId: OWNER.id };

const ownClient: CrmClientRecord = {
  id: CLIENT_ID,
  role: "user",
  managerId: OWN_MGR.id,
  name: "Алия",
  email: "aliya@example.kz",
  phone: "+77015551122",
  extraPhones: ["+77019998877"],
  tags: ["vip"],
  customFields: { hobby: "Чтение", gift: false },
  locale: "ru",
  source: { utmSource: "instagram" },
};

const otherClient: CrmClientRecord = { ...ownClient, id: OTHER_CLIENT_ID, managerId: OWNER.id };

const sampleTrace: BotTurnTrace = {
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
  counts: { tasks: 2, overdueTasks: 1, waiting: 1, missed: 0, unsorted: 3, openDeals: 4, openDealsSum: 120000, noNextStep: 1 },
  plan: { planAmount: 500000, factAmount: 150000, planDeals: 10, factDeals: 3 },
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
    unread: 1,
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
  maxDiscountPercent: 10,
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

const listsMock: CrmListsPorts = {
  today: vi.fn(async () => todayFixture),
  tasks: vi.fn(async () => []),
  calls: vi.fn(async () => ({ stats: { total: 1, answered: 1, missed: 0, talk: 60 }, calls: [] })),
  clients: vi.fn(async () => ({ total: 0, page: 1, pageSize: 40, clients: [] })),
  clientCard: vi.fn(async () => clientCardFixture),
  staffList: vi.fn(async () => ({ canAssignOthers: true, staff: [{ id: OWNER.id, name: "Руководитель" }] })),
  notifications: vi.fn(async () => []),
  markNotificationsRead: vi.fn(async () => {}),
  chats: vi.fn(async () => []),
  chatDetail: vi.fn(async () => chatDetailFixture),
  conversation: vi.fn(async (id: string) => {
    if (id === CHAT_ID) return { id: CHAT_ID, assigneeId: OWN_MGR.id, unread: 2, status: "open" };
    if (id === OTHER_CHAT_ID) return { id: OTHER_CHAT_ID, assigneeId: OWNER.id, unread: 0, status: "open" };
    return null;
  }),
  chatMessages: vi.fn(async () => ({ messages: [], more: false })),
  deals: vi.fn(async () => ({ pipelines: [], pipeline: null, stages: [], deals: [] })),
  dealDetail: vi.fn(async () => dealDetailFixture),
  orders: vi.fn(async () => ({ canEdit: true, statuses: [], orders: [] })),
  orderDetail: vi.fn(async () => orderDetailFixture),
};

const dealsMock: CrmDealsPorts = {
  findDeal: vi.fn(async (id: string) => (id === DEAL_ID ? ownDeal : id === OTHER_DEAL_ID ? otherDeal : null)),
  dealById: vi.fn(async (id: string) => (id === DEAL_ID ? ownDealReport : id === OTHER_DEAL_ID ? otherDealReport : null)),
  listFields: vi.fn(async () => dealFieldDefs),
  agreedPlan: vi.fn(async () => "hardcover"),
  agreedGifts: vi.fn(async () => ["giftwrap"]),
  discountLimit: vi.fn(async () => 15),
  updateDeal: vi.fn(async () => ({ ok: "Сохранено" })),
  setAgreedPlan: vi.fn(async () => ({ ok: true })),
  setAgreedGifts: vi.fn(async () => ({ ok: true })),
  duplicates: vi.fn(async () => ({
    open: [
      {
        deal: { id: DEAL_ID, number: 50, title: "Дубль свой", amount: 25000, closedAt: null, createdAt: new Date("2026-11-10T10:00:00Z"), assigneeId: OWN_MGR.id },
        stage: { name: "В работе" },
      },
      {
        deal: { id: OTHER_DEAL_ID, number: 51, title: "Дубль чужой", amount: 25000, closedAt: null, createdAt: new Date("2026-11-11T10:00:00Z"), assigneeId: OWNER.id },
        stage: { name: "В работе" },
      },
    ],
    past: [],
  })),
  findClientByPhone: vi.fn(async () => null),
  clientBrief: vi.fn(async () => null),
  listPipelines: vi.fn(async () => [
    { id: PIPELINE_1, name: "Основная" },
    { id: PIPELINE_2, name: "Повторные" },
  ]),
  listStages: vi.fn(async () => [{ id: STAGE_1, pipelineId: PIPELINE_1 }]),
  createClientFromDeal: vi.fn(async () => ({
    done: { clientId: CLIENT_ID, loginText: "+77015551122", password: "secret-pass", message: "Доступ отправлен" },
  })),
  linkDealClient: vi.fn(async () => ({ ok: true })),
  mergeDeal: vi.fn(async () => undefined),
  movePipeline: vi.fn(async () => {}),
  deleteDeal: vi.fn(async () => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/admin/deals;307;" });
  }),
};

const clientsMock: CrmClientsPorts = {
  clientById: vi.fn(async (id: string) => (id === CLIENT_ID ? ownClient : id === OTHER_CLIENT_ID ? otherClient : null)),
  listFields: vi.fn(async () => clientFieldDefs),
  noMarketingFor: vi.fn(async () => false),
  allStaff: vi.fn(async () => [
    { id: OWNER.id, name: "Руководитель", email: OWNER.email, disabled: false },
    { id: OWN_MGR.id, name: "Менеджер Свои", email: OWN_MGR.email, disabled: false },
  ]),
  listStages: vi.fn(async () => [{ id: STAGE_1, name: "Взяли в работу", kind: "open", pipelineId: PIPELINE_1 }]),
  listPipelines: vi.fn(async () => [{ id: PIPELINE_1, name: "Основная" }]),
  discountLimit: vi.fn(async () => 15),
  payFormOptions: vi.fn(async () => ["Kaspi Gold", "Перевод"]),
  issueClientAccess: vi.fn(async () => ({ loginText: "+77015551122", password: "new-password", message: "Новый доступ" })),
  remindClient: vi.fn(async () => ({ ok: true, message: "Напоминание отправлено" })),
  setClientPhones: vi.fn(async () => ({ ok: true, message: "Сохранено номеров: 1" })),
  updateClientTags: vi.fn(async () => {}),
  setClientFields: vi.fn(async () => ({ ok: "Сохранено" })),
  setClientNoMarketing: vi.fn(async () => ({ ok: true, message: "Не пишем первыми" })),
  setClientLocale: vi.fn(async () => ({ ok: true, message: "Язык: казахский" })),
  setClientChannel: vi.fn(async () => ({ ok: true, message: "Канал: Instagram" })),
  setClientManager: vi.fn(async () => ({ ok: true as const })),
  createClient: vi.fn(async () => ({
    done: {
      clientId: CLIENT_ID,
      clientName: "Алия",
      dealId: DEAL_ID,
      dealNumber: 42,
      parts: [{ dealId: DEAL_ID, dealNumber: 42, agreed: 29000, prepaid: 10000, paymentId: PAYMENT_ID }],
      count: 1,
      loginText: "+77015551122",
      password: "gen-password",
      loginUrl: "http://localhost:3000/login",
      message: "Доступ",
      agreed: 29000,
      prepaid: 10000,
      remainder: 19000,
      tasks: 1,
    },
  })),
  uploadDealReceipt: vi.fn(async () => ({ ok: true as const })),
};

const chatsMock: CrmChatsPorts = {
  conversation: vi.fn(async (id: string) => {
    if (id === CHAT_ID) return { id: CHAT_ID, assigneeId: OWN_MGR.id, clientId: CLIENT_ID };
    if (id === OTHER_CHAT_ID) return { id: OTHER_CHAT_ID, assigneeId: OWNER.id, clientId: OTHER_CLIENT_ID };
    return null;
  }),
  botTrace: vi.fn(async () => ({ trace: sampleTrace })),
  botTraces: vi.fn(async () => [{ id: MSG_ID, at: new Date("2026-11-25T10:00:00Z"), messageId: null, trace: sampleTrace }]),
  startBot: vi.fn(async () => {}),
  stopBot: vi.fn(async () => {}),
  chatOffers: vi.fn(async () => ({ order: { number: 105 }, book: { title: "Мама" }, maxDiscount: 12 })),
  sendOffer: vi.fn(async () => ({ ok: true, message: "Отправлено" })),
};

function multipartReceipt(fileName = "receipt.jpg", content = "jpeg-bytes") {
  const boundary = "----mybookReceiptBoundary";
  const body = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: image/jpeg\r\n\r\n${content}\r\n--${boundary}--\r\n`,
  );
  return { payload: body, contentType: `multipart/form-data; boundary=${boundary}` };
}

let app: NestFastifyApplication;

beforeAll(async () => {
  ({ app } = await bootTestApp({
    users: [OWNER, OWN_MGR, VIEW_ONLY, DISABLED, REGULAR],
    overrides: [
      [STAFF_ACCESS, staffAccess],
      [CRM_LISTS_PORTS, listsMock],
      [CRM_DEALS_PORTS, dealsMock],
      [CRM_CLIENTS_PORTS, clientsMock],
      [CRM_CHATS_PORTS, chatsMock],
    ],
  }));
});

afterAll(() => app.close());

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Контекст 4A — CRM-1 (37 маршрутов API v1): e2e", () => {
  it("общая безопасность: 401 без входа, 403 не-сотрудник/отключённый/чужой Origin, 405 с Allow", async () => {
    expect((await app.inject({ method: "GET", url: "/api/v1/crm/today" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/v1/crm/today", headers: as(REGULAR) })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/api/v1/crm/today", headers: as(DISABLED) })).statusCode).toBe(403);

    const badOrigin = await app.inject({
      method: "POST",
      url: "/api/v1/crm/notifications/read",
      headers: { ...as(OWNER), origin: "https://evil.example" },
      payload: {},
    });
    expect(badOrigin.statusCode).toBe(403);
    expect(badOrigin.json().code).toBe("forbidden");

    const wrongMethod = await app.inject({ method: "DELETE", url: "/api/v1/crm/today", headers: as(OWNER) });
    expect(wrongMethod.statusCode).toBe(405);
    expect(wrongMethod.headers.allow).toBe("GET");
  });

  it("списки (15 маршрутов): 200, ETag/304, права, 400, 403/404 на чужой чат и побочный эффект markRead", async () => {
    // 1. crmToday + ETag/304
    const today1 = await app.inject({ method: "GET", url: "/api/v1/crm/today", headers: as(OWNER) });
    expect(today1.statusCode).toBe(200);
    expect(today1.headers.etag).toBeTruthy();
    const today304 = await app.inject({
      method: "GET",
      url: "/api/v1/crm/today",
      headers: { ...as(OWNER), "if-none-match": String(today1.headers.etag) },
    });
    expect(today304.statusCode).toBe(304);

    // 2. crmTasksList
    const tasks = await app.inject({ method: "GET", url: "/api/v1/crm/tasks?done=1&who=all&kind=call&q=test", headers: as(OWNER) });
    expect(tasks.statusCode).toBe(200);
    expect(listsMock.tasks).toHaveBeenCalledWith(expect.objectContaining({ isOwner: true }), { done: true, who: "all", kind: "call", q: "test" });

    // 3. crmCallsList + 403 без calls.view + 400 при неверных days
    expect((await app.inject({ method: "GET", url: "/api/v1/crm/calls?f=missed&days=7", headers: as(OWNER) })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/v1/crm/calls", headers: as(VIEW_ONLY) })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/api/v1/crm/calls?days=999", headers: as(OWNER) })).statusCode).toBe(400);

    // 4-5. crmClientsList & crmClientCard
    expect((await app.inject({ method: "GET", url: "/api/v1/crm/clients?q=ali&sort=ltv&page=2&mine=1", headers: as(OWNER) })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `/api/v1/crm/clients/${CLIENT_ID}`, headers: as(OWNER) })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `/api/v1/crm/clients/${CLIENT_ID}`, headers: as(VIEW_ONLY) })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/api/v1/crm/clients/bad-id", headers: as(OWNER) })).statusCode).toBe(400);

    // 6-8. crmStaffList, crmNotificationsList, crmNotificationsRead
    expect((await app.inject({ method: "GET", url: "/api/v1/crm/staff", headers: as(VIEW_ONLY) })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/v1/crm/notifications?limit=20", headers: as(VIEW_ONLY) })).statusCode).toBe(200);
    const readRes = await app.inject({
      method: "POST",
      url: "/api/v1/crm/notifications/read",
      headers: as(OWNER),
      payload: { id: MSG_ID },
    });
    expect(readRes.statusCode).toBe(200);
    expect(readRes.headers["cache-control"]).toBe("no-store");
    expect(listsMock.markNotificationsRead).toHaveBeenCalledWith(OWNER.id, MSG_ID);

    // 9-11. crmChatsList, crmChatGet, crmChatMessages (404 не найден, 403 чужой чат для scope: own)
    expect((await app.inject({ method: "GET", url: "/api/v1/crm/chats?f=waiting&q=test", headers: as(OWN_MGR) })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `/api/v1/crm/chats/${CHAT_ID}?limit=30`, headers: as(OWN_MGR) })).statusCode).toBe(200);
    const msgsOk = await app.inject({
      method: "GET",
      url: `/api/v1/crm/chats/${CHAT_ID}/messages?limit=25&before=2026-11-25T10:00:00.000Z`,
      headers: as(OWN_MGR),
    });
    expect(msgsOk.statusCode).toBe(200);
    expect(msgsOk.json()).toEqual({ messages: [], more: false, unread: 2, status: "open" });
    expect((await app.inject({ method: "GET", url: `/api/v1/crm/chats/${OTHER_CHAT_ID}/messages`, headers: as(OWN_MGR) })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: `/api/v1/crm/chats/${ORDER_ID}/messages`, headers: as(OWNER) })).statusCode).toBe(404);

    // 12-15. crmDealsList, crmDealGet, crmOrdersList, crmOrder
    expect((await app.inject({ method: "GET", url: "/api/v1/crm/deals?mine=1&q=mama", headers: as(OWNER) })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `/api/v1/crm/deals/${DEAL_ID}`, headers: as(OWNER) })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/v1/crm/orders", headers: as(OWNER) })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `/api/v1/crm/orders/${ORDER_ID}`, headers: as(OWNER) })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/v1/crm/orders", headers: as(VIEW_ONLY) })).statusCode).toBe(403);
  });

  it("сделки и «Ещё» (10 маршрутов): права, скрытие чужой сделки (404), контакты, refused (400), NEXT_REDIRECT и эффекты", async () => {
    // 16. crmDealForm: своя сделка у менеджера без clients.contacts — контакты null; чужая сделка → 404
    const formMgr = await app.inject({ method: "GET", url: `/api/v1/crm/deals/${DEAL_ID}/form`, headers: as(OWN_MGR) });
    expect(formMgr.statusCode).toBe(200);
    expect(formMgr.json()).toMatchObject({ id: DEAL_ID, phone: null, email: null, extraPhones: [], canEditContacts: false, canEdit: true });
    expect((await app.inject({ method: "GET", url: `/api/v1/crm/deals/${OTHER_DEAL_ID}/form`, headers: as(OWN_MGR) })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/api/v1/crm/deals/${ORDER_ID}/form`, headers: as(OWNER) })).statusCode).toBe(404);

    // 17. crmDealUpdate: слияние полей и cf_*; 403 без deals.edit; 400 refused
    const updOk = await app.inject({
      method: "PATCH",
      url: `/api/v1/crm/deals/${DEAL_ID}`,
      headers: as(OWNER),
      payload: { title: "Новая сделка", phone: "+77010000000", fields: { city: "Астана", vip: "false" } },
    });
    expect(updOk.statusCode).toBe(200);
    const sentForm = vi.mocked(dealsMock.updateDeal).mock.calls[0]?.[1];
    expect(sentForm?.get("title")).toBe("Новая сделка");
    expect(sentForm?.get("contactPhone")).toBe("+77010000000");
    expect(sentForm?.get("cf_city")).toBe("Астана");
    expect(sentForm?.get("cf_vip__present")).toBe("1");
    expect(sentForm?.get("cf_vip")).toBeNull();

    expect((await app.inject({ method: "PATCH", url: `/api/v1/crm/deals/${DEAL_ID}`, headers: as(VIEW_ONLY), payload: { title: "Нельзя" } })).statusCode).toBe(403);
    vi.mocked(dealsMock.updateDeal).mockResolvedValueOnce({ error: "Скидка выше лимита" });
    const updRefused = await app.inject({ method: "PATCH", url: `/api/v1/crm/deals/${DEAL_ID}`, headers: as(OWNER), payload: { amount: 1000 } });
    expect(updRefused.statusCode).toBe(400);
    expect(updRefused.json()).toEqual({ error: "Скидка выше лимита", code: "refused" });
    expect(updRefused.headers["cache-control"]).toBe("no-store");

    // 18-19. crmDealPlan & crmDealGifts
    expect((await app.inject({ method: "PUT", url: `/api/v1/crm/deals/${DEAL_ID}/plan`, headers: as(OWNER), payload: { plan: "premium" } })).json()).toEqual({ ok: true, message: "Тариф сохранён" });
    vi.mocked(dealsMock.setAgreedPlan).mockResolvedValueOnce({ ok: false, message: "Заказ уже оформлен" });
    expect((await app.inject({ method: "PUT", url: `/api/v1/crm/deals/${DEAL_ID}/plan`, headers: as(OWNER), payload: { plan: null } })).statusCode).toBe(400);

    expect((await app.inject({ method: "PUT", url: `/api/v1/crm/deals/${DEAL_ID}/gifts`, headers: as(OWNER), payload: { gifts: ["delivery"] } })).json()).toEqual({ ok: true, message: "Сохранено" });
    vi.mocked(dealsMock.setAgreedGifts).mockResolvedValueOnce({ ok: false, message: "Заказ уже оформлен" });
    expect((await app.inject({ method: "PUT", url: `/api/v1/crm/deals/${DEAL_ID}/gifts`, headers: as(OWNER), payload: { gifts: [] } })).statusCode).toBe(400);

    // 20. crmDealExtras: фильтр дублей по scope: own, 404 на чужую сделку
    const extrasMgr = await app.inject({ method: "GET", url: `/api/v1/crm/deals/${DEAL_ID}/extras`, headers: as(OWN_MGR) });
    expect(extrasMgr.statusCode).toBe(200);
    expect(extrasMgr.json().duplicates).toHaveLength(1);
    expect(extrasMgr.json().duplicates[0].number).toBe(50);
    expect(extrasMgr.json().canMovePipeline).toBe(true);
    expect((await app.inject({ method: "GET", url: `/api/v1/crm/deals/${OTHER_DEAL_ID}/extras`, headers: as(OWN_MGR) })).statusCode).toBe(404);

    // 21. crmDealClientCreate
    const dcOk = await app.inject({
      method: "POST",
      url: `/api/v1/crm/deals/${DEAL_ID}/client`,
      headers: as(OWNER),
      payload: { name: "Алия", email: "aliya@example.kz", locale: "ru", channel: "instagram" },
    });
    expect(dcOk.statusCode).toBe(200);
    expect(dcOk.json()).toEqual({ clientId: CLIENT_ID, login: "+77015551122", password: "secret-pass", message: "Доступ отправлен" });
    expect((await app.inject({ method: "POST", url: `/api/v1/crm/deals/${DEAL_ID}/client`, headers: as(VIEW_ONLY), payload: { name: "А", channel: "instagram" } })).statusCode).toBe(403);

    // 22. crmDealClientLink (привязка и отвязка)
    expect((await app.inject({ method: "PUT", url: `/api/v1/crm/deals/${DEAL_ID}/client`, headers: as(OWNER), payload: { clientId: CLIENT_ID } })).json()).toEqual({
      ok: true,
      message: "Сделка привязана к клиенту",
    });
    expect((await app.inject({ method: "PUT", url: `/api/v1/crm/deals/${DEAL_ID}/client`, headers: as(OWNER), payload: { clientId: null } })).json()).toEqual({
      ok: true,
      message: "Сделка отвязана от клиента",
    });

    // 23. crmDealMerge
    expect((await app.inject({ method: "POST", url: `/api/v1/crm/deals/${DEAL_ID}/merge`, headers: as(OWNER), payload: { sourceId: OTHER_DEAL_ID } })).json()).toEqual({
      ok: true,
      message: "Сделки объединены",
    });
    vi.mocked(dealsMock.mergeDeal).mockResolvedValueOnce({ error: "Закрытую сделку слить нельзя" });
    expect((await app.inject({ method: "POST", url: `/api/v1/crm/deals/${DEAL_ID}/merge`, headers: as(OWNER), payload: { sourceId: OTHER_DEAL_ID } })).statusCode).toBe(400);

    // 24. crmDealPipeline (+ перехват ошибки /этапов/ → 400 refused)
    expect((await app.inject({ method: "PUT", url: `/api/v1/crm/deals/${DEAL_ID}/pipeline`, headers: as(OWNER), payload: { pipelineId: PIPELINE_2 } })).json()).toEqual({
      ok: true,
      message: "Сделка перенесена в другую воронку",
    });
    vi.mocked(dealsMock.movePipeline).mockRejectedValueOnce(new Error("В воронке нет этапов «в работе»"));
    const pipeRefused = await app.inject({ method: "PUT", url: `/api/v1/crm/deals/${DEAL_ID}/pipeline`, headers: as(OWNER), payload: { pipelineId: PIPELINE_2 } });
    expect(pipeRefused.statusCode).toBe(400);
    expect(pipeRefused.json().code).toBe("refused");

    // 25. crmDealDelete (NEXT_REDIRECT → 200, ошибка → 400 refused, без deals.delete → 403)
    expect((await app.inject({ method: "DELETE", url: `/api/v1/crm/deals/${DEAL_ID}`, headers: as(OWNER) })).json()).toEqual({ ok: true, message: "Сделка удалена" });
    expect((await app.inject({ method: "DELETE", url: `/api/v1/crm/deals/${DEAL_ID}`, headers: as(OWN_MGR) })).statusCode).toBe(403);
    vi.mocked(dealsMock.deleteDeal).mockResolvedValueOnce({ error: "По сделке есть оплата" });
    expect((await app.inject({ method: "DELETE", url: `/api/v1/crm/deals/${DEAL_ID}`, headers: as(OWNER) })).statusCode).toBe(400);
  });

  it("клиенты и чек сделки (7 маршрутов): права, скрытие чужого клиента (404), пошаговая правка, новый клиент, multipart чек", async () => {
    // 26. crmClientAccess
    const acc = await app.inject({ method: "POST", url: `/api/v1/crm/clients/${CLIENT_ID}/access`, headers: as(OWNER) });
    expect(acc.statusCode).toBe(200);
    expect(acc.json()).toEqual({ login: "+77015551122", password: "new-password", message: "Новый доступ" });
    expect((await app.inject({ method: "POST", url: `/api/v1/crm/clients/${CLIENT_ID}/access`, headers: as(VIEW_ONLY) })).statusCode).toBe(403);

    // 27. crmClientRemind
    const rem = await app.inject({ method: "POST", url: `/api/v1/crm/clients/${CLIENT_ID}/remind`, headers: as(OWNER) });
    expect(rem.statusCode).toBe(200);
    vi.mocked(clientsMock.remindClient).mockResolvedValueOnce({ ok: false, message: "У клиента нет почты" });
    expect((await app.inject({ method: "POST", url: `/api/v1/crm/clients/${CLIENT_ID}/remind`, headers: as(OWNER) })).statusCode).toBe(400);

    // 28. crmClientForm (чужой клиент у scope: own → 404; ограниченный список менеджеров)
    const cfMgr = await app.inject({ method: "GET", url: `/api/v1/crm/clients/${CLIENT_ID}/form`, headers: as(OWN_MGR) });
    expect(cfMgr.statusCode).toBe(200);
    expect(cfMgr.json().managers).toEqual([{ id: OWN_MGR.id, label: "Менеджер Свои" }]);
    expect(cfMgr.json().phone).toBeNull();
    expect((await app.inject({ method: "GET", url: `/api/v1/crm/clients/${OTHER_CLIENT_ID}/form`, headers: as(OWN_MGR) })).statusCode).toBe(404);

    // 29. crmClientUpdate: все шаги и остановка на первом отказе
    const cuOk = await app.inject({
      method: "PATCH",
      url: `/api/v1/crm/clients/${CLIENT_ID}`,
      headers: as(OWNER),
      payload: { extraPhones: ["+77012223344"], tags: ["vip"], fields: { hobby: "Кино" }, noMarketing: true, locale: "kk", channel: "instagram", managerId: OWN_MGR.id },
    });
    expect(cuOk.statusCode).toBe(200);
    expect(clientsMock.setClientPhones).toHaveBeenCalledTimes(1);
    expect(clientsMock.updateClientTags).toHaveBeenCalledTimes(1);
    expect(clientsMock.setClientFields).toHaveBeenCalledTimes(1);
    expect(clientsMock.setClientManager).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    vi.mocked(clientsMock.setClientLocale).mockResolvedValueOnce({ ok: false, message: "Неверный язык" });
    const cuStop = await app.inject({
      method: "PATCH",
      url: `/api/v1/crm/clients/${CLIENT_ID}`,
      headers: as(OWNER),
      payload: { locale: "zz", channel: "instagram" },
    });
    expect(cuStop.statusCode).toBe(400);
    expect(cuStop.json()).toEqual({ error: "Неверный язык", code: "refused" });
    expect(clientsMock.setClientChannel).not.toHaveBeenCalled();

    // 30-31. crmClientNewOptions & crmClientCreate
    const newOpts = await app.inject({ method: "GET", url: "/api/v1/crm/clients/new", headers: as(OWN_MGR) });
    expect(newOpts.statusCode).toBe(200);
    expect(newOpts.json()).toMatchObject({ me: OWN_MGR.id, canAssign: false, canDeal: true, defaultStageId: STAGE_1 });

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/crm/clients",
      headers: as(OWNER),
      payload: {
        name: "Алия",
        phone: "+77015551122",
        channel: "instagram",
        deal: { plan: "hardcover", count: 1, agreed: 29000, prepaid: 10000, gifts: ["giftwrap"] },
      },
    });
    expect(created.statusCode).toBe(200);
    const createdForm = vi.mocked(clientsMock.createClient).mock.calls[0]?.[1];
    expect(createdForm?.get("createDeal")).toBe("on");
    expect(createdForm?.get("giftWrap")).toBe("on");

    // 32. crmDealReceipt: multipart 200, 409 passthrough, 400 не multipart, 403 без deals.edit
    const mp = multipartReceipt();
    const recOk = await app.inject({
      method: "POST",
      url: `/api/v1/crm/deals/${DEAL_ID}/receipts?amount=10000&paymentId=${PAYMENT_ID}`,
      headers: { ...bearer(OWNER), "content-type": mp.contentType },
      payload: mp.payload,
    });
    expect(recOk.statusCode).toBe(200);
    expect(recOk.json()).toEqual({ ok: true, message: "Чек приложен" });
    expect(clientsMock.uploadDealReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ token: sessionOf(OWNER) }),
      expect.objectContaining({ dealId: DEAL_ID, amount: "10000", paymentId: PAYMENT_ID }),
    );

    vi.mocked(clientsMock.uploadDealReceipt).mockResolvedValueOnce({
      ok: false,
      response: Response.json({ error: "Чек уже приложен к сделке Д10" }, { status: 409 }),
    });
    const recDup = await app.inject({
      method: "POST",
      url: `/api/v1/crm/deals/${DEAL_ID}/receipts?amount=10000`,
      headers: { ...bearer(OWNER), "content-type": mp.contentType },
      payload: mp.payload,
    });
    expect(recDup.statusCode).toBe(409);
    expect(recDup.json()).toEqual({ error: "Чек уже приложен к сделке Д10" });

    expect((await app.inject({ method: "POST", url: `/api/v1/crm/deals/${DEAL_ID}/receipts?amount=10000`, headers: as(OWNER) })).statusCode).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/crm/deals/${DEAL_ID}/receipts?amount=10000`,
          headers: { ...as(VIEW_ONLY), "content-type": mp.contentType },
          payload: mp.payload,
        })
      ).statusCode,
    ).toBe(403);
  });

  it("чаты, бот и КП (5 маршрутов): следы, запуск/остановка, офферы, скидка без percent/hours → refused, 404 чужой чат", async () => {
    // 33. crmChatBotTrace
    const trOk = await app.inject({ method: "GET", url: `/api/v1/crm/chats/${CHAT_ID}/messages/${MSG_ID}/trace`, headers: as(OWN_MGR) });
    expect(trOk.statusCode).toBe(200);
    expect(trOk.json().rows.length).toBeGreaterThan(0);

    vi.mocked(chatsMock.botTrace).mockResolvedValueOnce({ error: "След хода не найден" });
    expect((await app.inject({ method: "GET", url: `/api/v1/crm/chats/${CHAT_ID}/messages/${MSG_ID}/trace`, headers: as(OWN_MGR) })).statusCode).toBe(400);

    // 34. crmChatBotTraces
    const tracesOk = await app.inject({ method: "GET", url: `/api/v1/crm/chats/${CHAT_ID}/bot/traces`, headers: as(OWN_MGR) });
    expect(tracesOk.statusCode).toBe(200);
    expect(tracesOk.json().items[0]).toMatchObject({ id: MSG_ID, silent: true });
    expect((await app.inject({ method: "GET", url: `/api/v1/crm/chats/${OTHER_CHAT_ID}/bot/traces`, headers: as(OWN_MGR) })).statusCode).toBe(404);

    // 35. crmChatBot
    expect((await app.inject({ method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/bot`, headers: as(OWN_MGR), payload: { run: true } })).json()).toEqual({
      ok: true,
      message: "Бот запущен",
    });
    expect(chatsMock.startBot).toHaveBeenCalledTimes(1);
    expect((await app.inject({ method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/bot`, headers: as(OWN_MGR), payload: { run: false } })).json()).toEqual({
      ok: true,
      message: "Бот остановлен",
    });
    expect(chatsMock.stopBot).toHaveBeenCalledTimes(1);
    expect((await app.inject({ method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/bot`, headers: as(VIEW_ONLY), payload: { run: true } })).statusCode).toBe(403);

    // 36. crmChatOffers
    const offers = await app.inject({ method: "GET", url: `/api/v1/crm/chats/${CHAT_ID}/offers`, headers: as(OWN_MGR) });
    expect(offers.statusCode).toBe(200);
    expect(offers.json()).toMatchObject({ order: { number: 105 }, book: { title: "Мама" }, maxDiscount: 12, percents: [5, 10, 12], canSend: true });
    expect((await app.inject({ method: "GET", url: `/api/v1/crm/chats/${OTHER_CHAT_ID}/offers`, headers: as(OWN_MGR) })).statusCode).toBe(404);

    // 37. crmChatOfferSend
    const noPct = await app.inject({ method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/offers`, headers: as(OWN_MGR), payload: { kind: "discount" } });
    expect(noPct.statusCode).toBe(400);
    expect(noPct.json()).toEqual({ error: "Укажите размер скидки и срок", code: "refused" });
    expect(chatsMock.sendOffer).not.toHaveBeenCalled();

    const sendOk = await app.inject({
      method: "POST",
      url: `/api/v1/crm/chats/${CHAT_ID}/offers`,
      headers: as(OWN_MGR),
      payload: { kind: "discount", percent: 10, hours: 48 },
    });
    expect(sendOk.statusCode).toBe(200);
    expect(chatsMock.sendOffer).toHaveBeenCalledWith(expect.anything(), CHAT_ID, { kind: "discount", percent: 10, hours: 48 });
  });
});
