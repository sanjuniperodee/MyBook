import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { crmMobileRestRoutes, type Output } from "@mybook/contracts";
import { admin } from "@/i18n/admin";
import { StaffContext } from "@/modules/access/domain/StaffContext";
import { isPhoneEmail } from "@/modules/identity";
import { allPermissions, type Permission } from "@/shared/domain/permissions";
import { STAFF_ACCESS, type StaffAccessPort } from "../src/core/auth/staff";
import { ROUTE_REGISTRY, type RouteRegistry } from "../src/core/routes/route-registry";
import {
  CRM_MOBILE_API_PORTS,
  type CrmDashboardData,
  type CrmMobileApiPorts,
} from "../src/modules/crm-mobile-api/crm-mobile-api.tokens";
import { bootTestApp, sessionOf, testUser } from "./app";

const OWNER = testUser("11111111-1111-4111-8111-111111111111", { name: "Айгерим", email: "owner@mybooks.kz", role: "admin" });
const SALES = testUser("22222222-2222-4222-8222-222222222222", { name: "Данияр", email: "sales@mybooks.kz", role: "admin" });
const ANALYST = testUser("33333333-3333-4333-8333-333333333333", { name: "Алия", email: "analyst@mybooks.kz", role: "admin" });
const NO_PERMS = testUser("44444444-4444-4444-8444-444444444444", { name: "Стажёр", email: "intern@mybooks.kz", role: "admin" });
const READ_CHATS = testUser("55555555-5555-4555-8555-555555555555", { name: "Наблюдатель", email: "viewer@mybooks.kz", role: "admin" });
const READ_ORDERS = testUser("66666666-6666-4666-8666-666666666666", { name: "Оператор", email: "orders@mybooks.kz", role: "admin" });
const DISABLED = testUser("77777777-7777-4777-8777-777777777777", { name: "Бывший", email: "disabled@mybooks.kz", role: "admin", staffDisabled: true });
const REGULAR = testUser("88888888-8888-4888-8888-888888888888", { name: "Клиент", email: "client@mybooks.kz", role: "user" });

const TPL_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TPL_ID_2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab";
const CHAT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TARGET_CHAT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc";
const MSG_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MSG_ID_2 = "cccccccc-cccc-4ccc-8ccc-cccccccccccd";
const REPLY_ID = "cccccccc-cccc-4ccc-8ccc-ccccccccccce";
const CALL_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const DEAL_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const STAGE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeef";
const TASK_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const ORDER_ID = "99999999-9999-4999-8999-999999999999";
const CLIENT_ID = "12121212-1212-4121-8121-121212121212";

const asUser = (u: typeof OWNER) => ({ cookie: `mb_session=${sessionOf(u)}` });
const asOwner = asUser(OWNER);
const asSales = asUser(SALES);
const asAnalyst = asUser(ANALYST);
const asNoPerms = asUser(NO_PERMS);
const asReadChats = asUser(READ_CHATS);
const asReadOrders = asUser(READ_ORDERS);

const makeContext = (id: string, roleName: string, scope: "all" | "own", perms: readonly Permission[], isOwner = false) =>
  new StaffContext(id, roleName, isOwner ? "owner" : null, scope, new Set(perms), isOwner, { isPhoneEmail });

const staffAccess: StaffAccessPort = {
  async resolve(user) {
    if (user.role !== "admin" || user.staffDisabled) return null;
    if (user.id === OWNER.id) return { context: makeContext(user.id, "Руководитель", "all", allPermissions, true), gate: null };
    if (user.id === SALES.id) {
      return {
        context: makeContext(user.id, "Менеджер", "own", ["chats.view", "chats.send", "deals.view", "deals.edit", "calls.view", "calls.make"]),
        gate: null,
      };
    }
    if (user.id === ANALYST.id) return { context: makeContext(user.id, "Аналитик", "all", ["analytics.view"]), gate: null };
    if (user.id === NO_PERMS.id) return { context: makeContext(user.id, "Стажёр", "own", []), gate: null };
    if (user.id === READ_CHATS.id) return { context: makeContext(user.id, "Наблюдатель", "all", ["chats.view"]), gate: null };
    if (user.id === READ_ORDERS.id) return { context: makeContext(user.id, "Оператор", "all", ["orders.view"]), gate: null };
    return null;
  },
};

function multipartVoice(opts: { field?: string; filename?: string; mime?: string; data?: Buffer } = {}) {
  const boundary = "----MyBookVoiceBoundary7f9a";
  const parts: Buffer[] = [];
  if (opts.data !== undefined) {
    const field = opts.field ?? "voice";
    const filename = opts.filename ?? "record.m4a";
    const mime = opts.mime ?? "audio/mp4";
    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),
      opts.data,
      Buffer.from("\r\n"),
    );
  } else {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="note"\r\n\r\nempty\r\n`));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat(parts),
  };
}

const taskDetailFixture: Output<"crmTaskGet"> = {
  item: {
    id: TASK_ID,
    title: "Перезвонить по макету",
    kind: "call",
    dueAt: "2026-11-28T10:00:00.000Z",
    overdue: false,
    done: false,
    remindBeforeMin: 15,
    fromBot: false,
    assigneeId: OWNER.id,
    editable: true,
    context: { type: "deal", id: DEAL_ID, label: "Д42 · Мама" },
    target: { dealId: DEAL_ID, orderId: null, clientId: CLIENT_ID },
    contact: { phone: "77011234567", target: { dealId: DEAL_ID }, pbx: true, chat: true },
  },
  task: {
    id: TASK_ID,
    title: "Перезвонить по макету",
    kind: "call",
    dueAt: "2026-11-28T10:00:00.000Z",
    doneAt: null,
    done: false,
    result: "",
    assigneeId: OWNER.id,
    assignee: "Айгерим",
    createdBy: "Айгерим",
    fromBot: false,
    overdue: false,
    editable: true,
    remindBeforeMin: 15,
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
  chat: { id: CHAT_ID, preview: "Спасибо, ждём!", unread: 1 },
  notes: [{ id: "n-1", kind: "note", text: "Согласовали обложку", author: "Айгерим", at: "2026-11-26T09:00:00.000Z" }],
  others: [{ id: "t-2", title: "Уточнить доставку", dueAt: "2026-11-29T10:00:00.000Z", overdue: false }],
  reach: { phone: "77011234567", target: { dealId: DEAL_ID }, pbx: true, chat: true },
};

const dashboardFixture: CrmDashboardData = {
  cur: { sum: 145000, n: 5 },
  prev: { sum: 87000, n: 3 },
  newUsers: { cur: 18, prev: 12 },
  daily: [{ d: "2026-11-25", sum: 58000, n: 2 }],
  funnelRows: { rows: [{ registered: 100, with_book: 60, engaged: 40, ordered: 20, paid: 10 }] },
  byPlan: [
    { plan: "digital", sum: 20000, n: 2 },
    { plan: "hardcover", sum: 125000, n: 3 },
  ],
  attention: [{ id: "o-1" }, { id: "o-2" }],
  deadlines: [{ id: "d-1" }],
  dealDeadlines: [{ id: "dd-1" }, { id: "dd-2" }],
};

const ports = {
  autoShiftOnVisit: vi.fn<CrmMobileApiPorts["autoShiftOnVisit"]>(),
  setShift: vi.fn<CrmMobileApiPorts["setShift"]>(),
  live: vi.fn<CrmMobileApiPorts["live"]>(),
  dashboard: vi.fn<CrmMobileApiPorts["dashboard"]>(),
  stageCounts: vi.fn<CrmMobileApiPorts["stageCounts"]>(),
  listStages: vi.fn<CrmMobileApiPorts["listStages"]>(),
  listTemplates: vi.fn<CrmMobileApiPorts["listTemplates"]>(),
  saveMyTemplate: vi.fn<CrmMobileApiPorts["saveMyTemplate"]>(),
  deleteMyTemplate: vi.fn<CrmMobileApiPorts["deleteMyTemplate"]>(),
  duplicateTemplate: vi.fn<CrmMobileApiPorts["duplicateTemplate"]>(),
  reorderMyTemplates: vi.fn<CrmMobileApiPorts["reorderMyTemplates"]>(),
  aiTemplateDraft: vi.fn<CrmMobileApiPorts["aiTemplateDraft"]>(),
  callDial: vi.fn<CrmMobileApiPorts["callDial"]>(),
  markCallHandled: vi.fn<CrmMobileApiPorts["markCallHandled"]>(),
  chatProducts: vi.fn<CrmMobileApiPorts["chatProducts"]>(),
  sendProduct: vi.fn<CrmMobileApiPorts["sendProduct"]>(),
  sendCatalogLink: vi.fn<CrmMobileApiPorts["sendCatalogLink"]>(),
  orderItems: vi.fn<CrmMobileApiPorts["orderItems"]>(),
  openChat: vi.fn<CrmMobileApiPorts["openChat"]>(),
  forwardTargets: vi.fn<CrmMobileApiPorts["forwardTargets"]>(),
  assignConversation: vi.fn<CrmMobileApiPorts["assignConversation"]>(),
  createDealFromChat: vi.fn<CrmMobileApiPorts["createDealFromChat"]>(),
  forwardMessage: vi.fn<CrmMobileApiPorts["forwardMessage"]>(),
  sendInternalNote: vi.fn<CrmMobileApiPorts["sendInternalNote"]>(),
  pinChat: vi.fn<CrmMobileApiPorts["pinChat"]>(),
  markRead: vi.fn<CrmMobileApiPorts["markRead"]>(),
  setConversationStatus: vi.fn<CrmMobileApiPorts["setConversationStatus"]>(),
  sendMessage: vi.fn<CrmMobileApiPorts["sendMessage"]>(),
  findConversation: vi.fn<CrmMobileApiPorts["findConversation"]>(),
  convertAudio: vi.fn<CrmMobileApiPorts["convertAudio"]>(),
  sendUpload: vi.fn<CrmMobileApiPorts["sendUpload"]>(),
  editMessage: vi.fn<CrmMobileApiPorts["editMessage"]>(),
  deleteMessage: vi.fn<CrmMobileApiPorts["deleteMessage"]>(),
  resendMessage: vi.fn<CrmMobileApiPorts["resendMessage"]>(),
  transcribeMessage: vi.fn<CrmMobileApiPorts["transcribeMessage"]>(),
  createDeal: vi.fn<CrmMobileApiPorts["createDeal"]>(),
  acceptDeal: vi.fn<CrmMobileApiPorts["acceptDeal"]>(),
  assignDeal: vi.fn<CrmMobileApiPorts["assignDeal"]>(),
  moveDeal: vi.fn<CrmMobileApiPorts["moveDeal"]>(),
  addNote: vi.fn<CrmMobileApiPorts["addNote"]>(),
  rejectDeal: vi.fn<CrmMobileApiPorts["rejectDeal"]>(),
  createTask: vi.fn<CrmMobileApiPorts["createTask"]>(),
  taskDetail: vi.fn<CrmMobileApiPorts["taskDetail"]>(),
  updateTask: vi.fn<CrmMobileApiPorts["updateTask"]>(),
  deleteTask: vi.fn<CrmMobileApiPorts["deleteTask"]>(),
  completeTask: vi.fn<CrmMobileApiPorts["completeTask"]>(),
  snoozeTask: vi.fn<CrmMobileApiPorts["snoozeTask"]>(),
  toggleTask: vi.fn<CrmMobileApiPorts["toggleTask"]>(),
  moveOrder: vi.fn<CrmMobileApiPorts["moveOrder"]>(),
} satisfies CrmMobileApiPorts;

const SAMPLE_REQUESTS: Record<keyof typeof crmMobileRestRoutes, { method: "GET" | "POST" | "PATCH" | "DELETE"; url: string; payload?: Record<string, unknown>; multipart?: boolean }> = {
  crmMe: { method: "GET", url: "/api/v1/crm/me" },
  crmShiftSet: { method: "POST", url: "/api/v1/crm/me/shift", payload: { onShift: true } },
  crmOverview: { method: "GET", url: "/api/v1/crm/overview?period=30" },
  crmMyTemplates: { method: "GET", url: "/api/v1/crm/my-templates" },
  crmMyTemplateSave: { method: "POST", url: "/api/v1/crm/my-templates", payload: { title: "Привет", text: "Здравствуйте!" } },
  crmMyTemplateDelete: { method: "DELETE", url: `/api/v1/crm/my-templates/${TPL_ID}` },
  crmMyTemplateDuplicate: { method: "POST", url: `/api/v1/crm/my-templates/${TPL_ID}/duplicate` },
  crmMyTemplatesReorder: { method: "POST", url: "/api/v1/crm/my-templates/reorder", payload: { ids: [TPL_ID] } },
  crmMyTemplateDraft: { method: "POST", url: "/api/v1/crm/my-templates/draft", payload: { chatId: CHAT_ID, messageId: MSG_ID } },
  crmCallDial: { method: "POST", url: "/api/v1/crm/calls/dial", payload: { dealId: DEAL_ID } },
  crmCallHandled: { method: "POST", url: `/api/v1/crm/calls/${CALL_ID}/handled` },
  crmChatCatalog: { method: "GET", url: "/api/v1/crm/catalog/for-chat" },
  crmChatSendCatalog: { method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/catalog`, payload: { productId: "12345" } },
  crmChatMessageOrder: { method: "GET", url: `/api/v1/crm/chat-messages/${MSG_ID}/order` },
  crmChatOpen: { method: "POST", url: "/api/v1/crm/chats/open", payload: { clientId: CLIENT_ID } },
  crmChatForwardTargets: { method: "GET", url: "/api/v1/crm/chat-targets?q=%D0%90%D1%81%D0%B5%D0%BB%D1%8C" },
  crmChatAssign: { method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/assign`, payload: { userId: SALES.id } },
  crmChatCreateDeal: { method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/deal` },
  crmChatForward: { method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/forward`, payload: { messageIds: [MSG_ID], targetIds: [TARGET_CHAT_ID] } },
  crmChatNote: { method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/note`, payload: { text: "Позвонить завтра" } },
  crmChatPin: { method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/pin`, payload: { pinned: true } },
  crmChatRead: { method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/read` },
  crmChatStatus: { method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/status`, payload: { status: "closed" } },
  crmChatSendMessage: { method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/messages`, payload: { text: "Добрый день!" } },
  crmChatSendVoice: { method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/voice`, multipart: true },
  crmChatMessageEdit: { method: "PATCH", url: `/api/v1/crm/chats/${CHAT_ID}/messages/${MSG_ID}`, payload: { text: "Исправленный текст" } },
  crmChatMessageDelete: { method: "DELETE", url: `/api/v1/crm/chats/${CHAT_ID}/messages/${MSG_ID}` },
  crmChatMessageResend: { method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/messages/${MSG_ID}/resend` },
  crmChatMessageTranscribe: { method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/messages/${MSG_ID}/transcribe` },
  crmDealCreate: { method: "POST", url: "/api/v1/crm/deals", payload: { title: "Новая сделка" } },
  crmDealAccept: { method: "POST", url: `/api/v1/crm/deals/${DEAL_ID}/accept` },
  crmDealAssign: { method: "POST", url: `/api/v1/crm/deals/${DEAL_ID}/assign`, payload: { userId: SALES.id } },
  crmDealMove: { method: "POST", url: `/api/v1/crm/deals/${DEAL_ID}/move`, payload: { stageId: STAGE_ID } },
  crmDealNote: { method: "POST", url: `/api/v1/crm/deals/${DEAL_ID}/notes`, payload: { text: "Клиент ждёт звонка" } },
  crmDealReject: { method: "POST", url: `/api/v1/crm/deals/${DEAL_ID}/reject`, payload: { spam: false, reason: "Дубль" } },
  crmDealTaskCreate: { method: "POST", url: `/api/v1/crm/deals/${DEAL_ID}/tasks`, payload: { title: "Отправить ссылку" } },
  crmTaskCreate: { method: "POST", url: "/api/v1/crm/tasks", payload: { title: "Проверить макет" } },
  crmTaskGet: { method: "GET", url: `/api/v1/crm/tasks/${TASK_ID}` },
  crmTaskUpdate: { method: "PATCH", url: `/api/v1/crm/tasks/${TASK_ID}`, payload: { title: "Обновлённая задача" } },
  crmTaskDelete: { method: "DELETE", url: `/api/v1/crm/tasks/${TASK_ID}` },
  crmTaskComplete: { method: "POST", url: `/api/v1/crm/tasks/${TASK_ID}/complete`, payload: { result: "Готово" } },
  crmTaskSnooze: { method: "POST", url: `/api/v1/crm/tasks/${TASK_ID}/snooze`, payload: { by: "hour" } },
  crmTaskToggle: { method: "POST", url: `/api/v1/crm/tasks/${TASK_ID}/toggle` },
  crmOrderStatus: { method: "POST", url: `/api/v1/crm/orders/${ORDER_ID}/status`, payload: { status: "printing" } },
};

const PERM_GATED_ROUTES: (keyof typeof crmMobileRestRoutes)[] = [
  "crmOverview",
  "crmMyTemplates",
  "crmMyTemplateSave",
  "crmMyTemplateDelete",
  "crmMyTemplateDuplicate",
  "crmMyTemplatesReorder",
  "crmMyTemplateDraft",
  "crmCallDial",
  "crmCallHandled",
  "crmChatCatalog",
  "crmChatSendCatalog",
  "crmChatMessageOrder",
  "crmChatOpen",
  "crmChatForwardTargets",
  "crmChatAssign",
  "crmChatCreateDeal",
  "crmChatForward",
  "crmChatNote",
  "crmChatPin",
  "crmChatRead",
  "crmChatStatus",
  "crmChatSendMessage",
  "crmChatSendVoice",
  "crmChatMessageEdit",
  "crmChatMessageDelete",
  "crmChatMessageResend",
  "crmChatMessageTranscribe",
  "crmDealCreate",
  "crmDealAccept",
  "crmDealAssign",
  "crmDealMove",
  "crmDealNote",
  "crmDealReject",
  "crmOrderStatus",
];

let app: NestFastifyApplication;

beforeAll(async () => {
  ({ app } = await bootTestApp({
    users: [OWNER, SALES, ANALYST, NO_PERMS, READ_CHATS, READ_ORDERS, DISABLED, REGULAR],
    overrides: [
      [STAFF_ACCESS, staffAccess],
      [CRM_MOBILE_API_PORTS, ports],
    ],
  }));
});

afterAll(() => app.close());

beforeEach(() => {
  vi.clearAllMocks();
  ports.autoShiftOnVisit.mockResolvedValue(true);
  ports.setShift.mockResolvedValue();
  ports.live.mockResolvedValue({
    counters: { attention: 2, tasks: 5, chats: 3, calls: 1, deals: 4, reviews: 0, finance: 1 },
    unread: 7,
  });
  ports.dashboard.mockResolvedValue(dashboardFixture);
  ports.stageCounts.mockResolvedValue([
    { stageId: STAGE_ID, n: 6 },
    { stageId: "stage-won", n: 9 },
  ]);
  ports.listStages.mockResolvedValue([
    { id: STAGE_ID, name: "В работе", color: "#3b82f6", kind: "open" },
    { id: "stage-won", name: "Оплачен", color: "#22c55e", kind: "won" },
  ]);
  ports.listTemplates.mockResolvedValue([
    { id: TPL_ID, title: "Личный", text: "Привет!", own: true },
    { id: TPL_ID_2, title: "Общий", text: "Здравствуйте!", own: false },
  ]);
  ports.saveMyTemplate.mockResolvedValue({ ok: true, id: TPL_ID });
  ports.deleteMyTemplate.mockResolvedValue({ ok: true });
  ports.duplicateTemplate.mockResolvedValue({ ok: true });
  ports.reorderMyTemplates.mockResolvedValue({ ok: true });
  ports.aiTemplateDraft.mockResolvedValue({
    ok: true,
    title: "Приветствие",
    text: "Здравствуйте, {{name}}!",
    replaced: [{ was: "Асель", with: "{{name}}" }],
    ai: true,
  });
  ports.callDial.mockResolvedValue({ ok: true, message: "Сейчас зазвонит ваш телефон" });
  ports.markCallHandled.mockResolvedValue({ ok: true });
  ports.chatProducts.mockResolvedValue({
    ok: true,
    enabled: true,
    products: [{ id: "101", name: "Книга А5", price: 29000, currency: "KZT", hidden: false, image: true }],
  });
  ports.sendProduct.mockResolvedValue({ ok: true });
  ports.sendCatalogLink.mockResolvedValue({ ok: true });
  ports.orderItems.mockResolvedValue({
    ok: true,
    items: [{ name: "Книга А5", quantity: 1, price: 29000 }],
    total: 29000,
    currency: "KZT",
  });
  ports.openChat.mockResolvedValue({ ok: true, id: CHAT_ID });
  ports.forwardTargets.mockResolvedValue([{ id: TARGET_CHAT_ID, title: "Асель", channel: "WhatsApp", last: "Добрый день" }]);
  ports.assignConversation.mockResolvedValue();
  ports.createDealFromChat.mockResolvedValue({ id: DEAL_ID });
  ports.forwardMessage.mockResolvedValue({ sent: 1, failed: [] });
  ports.sendInternalNote.mockResolvedValue({ id: MSG_ID });
  ports.pinChat.mockResolvedValue({ ok: true });
  ports.markRead.mockResolvedValue();
  ports.setConversationStatus.mockResolvedValue();
  ports.sendMessage.mockResolvedValue({ id: MSG_ID, status: "sent", error: null });
  ports.findConversation.mockResolvedValue({ id: CHAT_ID, assigneeId: SALES.id });
  ports.convertAudio.mockResolvedValue({ data: new Uint8Array([1, 2, 3]), mime: "audio/ogg; codecs=opus" });
  ports.sendUpload.mockResolvedValue({ id: MSG_ID, status: "sent", error: null });
  ports.editMessage.mockResolvedValue({ ok: true });
  ports.deleteMessage.mockResolvedValue({ ok: true });
  ports.resendMessage.mockResolvedValue({ ok: true });
  ports.transcribeMessage.mockResolvedValue({ text: "Хочу заказать книгу маме" });
  ports.createDeal.mockRejectedValue(Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;/admin/deals/${DEAL_ID};307;` }));
  ports.acceptDeal.mockResolvedValue({ ok: true });
  ports.assignDeal.mockResolvedValue({ ok: true });
  ports.moveDeal.mockResolvedValue({ ok: true });
  ports.addNote.mockResolvedValue({});
  ports.rejectDeal.mockResolvedValue({ requested: false, message: "Заявка отклонена", deleted: true });
  ports.createTask.mockResolvedValue({});
  ports.taskDetail.mockResolvedValue(taskDetailFixture);
  ports.updateTask.mockResolvedValue({});
  ports.deleteTask.mockResolvedValue({});
  ports.completeTask.mockResolvedValue({});
  ports.snoozeTask.mockResolvedValue({});
  ports.toggleTask.mockResolvedValue({});
  ports.moveOrder.mockResolvedValue({});
});

function injectSample(name: keyof typeof crmMobileRestRoutes, headers: Record<string, string>) {
  const sample = SAMPLE_REQUESTS[name];
  if (sample.multipart) {
    const mp = multipartVoice({ data: Buffer.from("raw-audio-bytes") });
    return app.inject({ method: sample.method, url: sample.url, headers: { ...headers, ...mp.headers }, payload: mp.payload });
  }
  return app.inject({ method: sample.method, url: sample.url, headers, payload: sample.payload });
}

describe("Контекст 4B — CRM мобильный API v1 (44 маршрута)", () => {
  it("все 44 маршрута контракта crmMobileRestRoutes зарегистрированы в NestJS и покрыты тестами", () => {
    const keys = Object.keys(crmMobileRestRoutes) as (keyof typeof crmMobileRestRoutes)[];
    expect(keys).toHaveLength(44);
    expect(Object.keys(SAMPLE_REQUESTS).sort()).toEqual([...keys].sort());

    const registry = app.get<RouteRegistry>(ROUTE_REGISTRY);
    const registered = new Set(registry.list().map((r) => `${r.method} ${r.path}`));
    for (const key of keys) {
      const def = crmMobileRestRoutes[key];
      const nestPath = def.path.replace(/\{(\w+)\}/g, ":$1");
      expect(registered.has(`${def.method} ${nestPath}`), `маршрут ${key} не зарегистрирован`).toBe(true);
    }
  });

  it("401 без сессии на всех 44 маршрутах, 403 для обычного пользователя, отключённого сотрудника и чужого Origin", async () => {
    const keys = Object.keys(crmMobileRestRoutes) as (keyof typeof crmMobileRestRoutes)[];
    for (const key of keys) {
      const res = await injectSample(key, {});
      expect(res.statusCode, `${key} без сессии`).toBe(401);
      expect(res.json().code).toBe("unauthorized");
    }

    for (const u of [REGULAR, DISABLED]) {
      for (const key of ["crmMe", "crmOverview", "crmChatSendMessage", "crmDealCreate", "crmTaskGet", "crmOrderStatus"] as const) {
        const res = await injectSample(key, asUser(u));
        expect(res.statusCode, `${key} для ${u.email}`).toBe(403);
        expect(res.json().code).toBe("forbidden");
      }
    }

    for (const key of ["crmShiftSet", "crmMyTemplateDelete", "crmChatSendMessage", "crmDealCreate", "crmTaskUpdate", "crmOrderStatus"] as const) {
      const res = await injectSample(key, { ...asOwner, origin: "https://evil.example" });
      expect(res.statusCode, `${key} чужой Origin`).toBe(403);
      expect(res.json().code).toBe("forbidden");
    }
  });

  it("права @Permissions: сотрудник без прав получает 403 на всех 34 маршрутах с правами и 200 на 10 базовых маршрутах", async () => {
    const gatedSet = new Set(PERM_GATED_ROUTES);
    expect(PERM_GATED_ROUTES).toHaveLength(34);

    for (const key of PERM_GATED_ROUTES) {
      const res = await injectSample(key, asNoPerms);
      expect(res.statusCode, `${key} без прав`).toBe(403);
      expect(res.json().code).toBe("forbidden");
    }

    const baseRoutes = (Object.keys(crmMobileRestRoutes) as (keyof typeof crmMobileRestRoutes)[]).filter((k) => !gatedSet.has(k));
    expect(baseRoutes).toHaveLength(10);
    for (const key of baseRoutes) {
      const res = await injectSample(key, asNoPerms);
      expect(res.statusCode, `${key} базовый маршрут`).toBe(200);
    }

    // Неполный набор прав на маршрутах с двумя правами → 403
    for (const key of [
      "crmChatCatalog",
      "crmChatSendCatalog",
      "crmChatForwardTargets",
      "crmChatAssign",
      "crmChatCreateDeal",
      "crmChatForward",
      "crmChatStatus",
      "crmChatSendMessage",
      "crmChatSendVoice",
      "crmChatMessageEdit",
      "crmChatMessageDelete",
      "crmChatMessageResend",
    ] as const) {
      const res = await injectSample(key, asReadChats);
      expect(res.statusCode, `${key} только chats.view`).toBe(403);
    }

    const orderOnlyView = await injectSample("crmOrderStatus", asReadOrders);
    expect(orderOnlyView.statusCode).toBe(403);
  });

  it("405 Method Not Allowed с заголовком Allow на неверных методах", async () => {
    const checks: [string, string, string][] = [
      ["DELETE", "/api/v1/crm/me", "GET"],
      ["GET", "/api/v1/crm/me/shift", "POST"],
      ["POST", "/api/v1/crm/overview", "GET"],
      ["PATCH", "/api/v1/crm/my-templates", "GET, POST"],
      ["GET", `/api/v1/crm/deals/${DEAL_ID}/move`, "POST"],
      ["GET", `/api/v1/crm/chats/${CHAT_ID}/messages/${MSG_ID}`, "PATCH, DELETE"],
      ["PUT", `/api/v1/crm/tasks/${TASK_ID}`, "GET, PATCH, DELETE"],
      ["GET", `/api/v1/crm/orders/${ORDER_ID}/status`, "POST"],
    ];
    for (const [method, url, allow] of checks) {
      const res = await app.inject({ method: method as "GET", url, headers: asOwner });
      expect(res.statusCode, `${method} ${url}`).toBe(405);
      expect(res.headers.allow).toBe(allow);
    }
  });

  it("профиль, смена и обзор (crmMe, crmShiftSet, crmOverview): 200, ETag/304, раскладка и фильтрация этапов", async () => {
    const me = await app.inject({ method: "GET", url: "/api/v1/crm/me", headers: asOwner });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      id: OWNER.id,
      name: "Айгерим",
      role: "Руководитель",
      isOwner: true,
      scope: "all",
      onShift: true,
      layout: "leader",
      unread: 7,
    });
    const etag = me.headers.etag;
    expect(etag).toBeTruthy();
    const me304 = await app.inject({ method: "GET", url: "/api/v1/crm/me", headers: { ...asOwner, "if-none-match": String(etag) } });
    expect(me304.statusCode).toBe(304);

    const salesMe = await app.inject({ method: "GET", url: "/api/v1/crm/me", headers: asSales });
    expect(salesMe.json().layout).toBe("sales");

    const shift = await app.inject({ method: "POST", url: "/api/v1/crm/me/shift", headers: asOwner, payload: { onShift: false } });
    expect(shift.statusCode).toBe(200);
    expect(shift.json()).toEqual({ ok: true, onShift: false });
    expect(ports.setShift).toHaveBeenCalledWith(expect.objectContaining({ token: sessionOf(OWNER) }), false);

    const badShift = await app.inject({ method: "POST", url: "/api/v1/crm/me/shift", headers: asOwner, payload: { onShift: "yes" } });
    expect(badShift.statusCode).toBe(400);

    // crmOverview: period=7, period=14 -> 30, сортировка byPlan по sum desc, только kind="open"
    const ov7 = await app.inject({ method: "GET", url: "/api/v1/crm/overview?period=7", headers: asOwner });
    expect(ov7.statusCode).toBe(200);
    expect(ov7.json()).toMatchObject({
      period: 7,
      revenue: { cur: 145000, prev: 87000 },
      avgCheck: { cur: 29000, prev: 29000 },
      attention: { orders: 2, deadlines: 3 },
      stages: [{ id: STAGE_ID, name: "В работе", color: "#3b82f6", n: 6 }],
    });
    expect(ov7.json().byPlan.map((p: { plan: string }) => p.plan)).toEqual(["hardcover", "digital"]);

    const ov30 = await app.inject({ method: "GET", url: "/api/v1/crm/overview?period=14", headers: asAnalyst });
    expect(ov30.statusCode).toBe(200);
    expect(ov30.json().period).toBe(30);
    expect(ov30.json().stages).toEqual([]);
    // У аналитика нет deals.view — лишние запросы этапов не выполняются
    expect(ports.stageCounts).toHaveBeenCalledTimes(1);
    expect(ports.listStages).toHaveBeenCalledTimes(1);
  });

  it("личные шаблоны и черновик ИИ (6 маршрутов): успех, ETag/304 и 400 refused", async () => {
    const list = await app.inject({ method: "GET", url: "/api/v1/crm/my-templates", headers: asOwner });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual({
      mine: [{ id: TPL_ID, title: "Личный", text: "Привет!" }],
      shared: [{ id: TPL_ID_2, title: "Общий", text: "Здравствуйте!" }],
    });
    const list304 = await app.inject({ method: "GET", url: "/api/v1/crm/my-templates", headers: { ...asOwner, "if-none-match": String(list.headers.etag) } });
    expect(list304.statusCode).toBe(304);

    const saved = await app.inject({ method: "POST", url: "/api/v1/crm/my-templates", headers: asOwner, payload: { title: "Ответ", text: "Ок" } });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({ ok: true, id: TPL_ID });
    expect(ports.saveMyTemplate).toHaveBeenCalledWith(expect.anything(), "", "Ответ", "Ок");

    ports.saveMyTemplate.mockResolvedValueOnce({ error: "Не больше 100 личных шаблонов" });
    const saveRefused = await app.inject({ method: "POST", url: "/api/v1/crm/my-templates", headers: asOwner, payload: { title: "Ответ", text: "Ок" } });
    expect(saveRefused.statusCode).toBe(400);
    expect(saveRefused.json()).toEqual({ error: "Не больше 100 личных шаблонов", code: "refused" });

    const del = await app.inject({ method: "DELETE", url: `/api/v1/crm/my-templates/${TPL_ID}`, headers: asOwner });
    expect(del.statusCode).toBe(200);
    ports.deleteMyTemplate.mockResolvedValueOnce({ error: "Шаблон не найден" });
    expect((await app.inject({ method: "DELETE", url: `/api/v1/crm/my-templates/${TPL_ID}`, headers: asOwner })).statusCode).toBe(400);

    const dup = await app.inject({ method: "POST", url: `/api/v1/crm/my-templates/${TPL_ID}/duplicate`, headers: asOwner });
    expect(dup.statusCode).toBe(200);

    const reorder = await app.inject({ method: "POST", url: "/api/v1/crm/my-templates/reorder", headers: asOwner, payload: { ids: [TPL_ID, TPL_ID_2] } });
    expect(reorder.statusCode).toBe(200);
    expect(ports.reorderMyTemplates).toHaveBeenCalledWith(expect.anything(), [TPL_ID, TPL_ID_2]);

    const draft = await app.inject({ method: "POST", url: "/api/v1/crm/my-templates/draft", headers: asOwner, payload: { chatId: CHAT_ID, messageId: MSG_ID } });
    expect(draft.statusCode).toBe(200);
    expect(draft.json()).toEqual({
      title: "Приветствие",
      text: "Здравствуйте, {{name}}!",
      replaced: [{ was: "Асель", placeholder: "{{name}}" }],
      ai: true,
    });
    ports.aiTemplateDraft.mockResolvedValueOnce({ ok: false, message: "Слишком много запросов к AI" });
    const draftRefused = await app.inject({ method: "POST", url: "/api/v1/crm/my-templates/draft", headers: asOwner, payload: { chatId: CHAT_ID, messageId: MSG_ID } });
    expect(draftRefused.statusCode).toBe(400);
    expect(draftRefused.json().code).toBe("refused");
  });

  it("звонки и статус заказа (3 маршрута): успех, refused и невалидные данные", async () => {
    const dial = await app.inject({ method: "POST", url: "/api/v1/crm/calls/dial", headers: asOwner, payload: { dealId: DEAL_ID } });
    expect(dial.statusCode).toBe(200);
    expect(dial.json()).toEqual({ ok: true, message: "Сейчас зазвонит ваш телефон" });

    ports.callDial.mockResolvedValueOnce({ ok: false, message: "У клиента нет номера телефона" });
    const dialRefused = await app.inject({ method: "POST", url: "/api/v1/crm/calls/dial", headers: asOwner, payload: { dealId: DEAL_ID } });
    expect(dialRefused.statusCode).toBe(400);
    expect(dialRefused.json()).toEqual({ error: "У клиента нет номера телефона", code: "refused" });

    const handled = await app.inject({ method: "POST", url: `/api/v1/crm/calls/${CALL_ID}/handled`, headers: asOwner });
    expect(handled.statusCode).toBe(200);
    ports.markCallHandled.mockResolvedValueOnce({ ok: false, message: "Звонок не найден" });
    expect((await app.inject({ method: "POST", url: `/api/v1/crm/calls/${CALL_ID}/handled`, headers: asOwner })).statusCode).toBe(400);

    const orderOk = await app.inject({ method: "POST", url: `/api/v1/crm/orders/${ORDER_ID}/status`, headers: asOwner, payload: { status: "printing" } });
    expect(orderOk.statusCode).toBe(200);
    expect(ports.moveOrder).toHaveBeenCalledWith(expect.anything(), ORDER_ID, "printing");

    ports.moveOrder.mockResolvedValueOnce({ error: "Неоплаченный заказ нельзя отправить в печать" });
    const orderRefused = await app.inject({ method: "POST", url: `/api/v1/crm/orders/${ORDER_ID}/status`, headers: asOwner, payload: { status: "printing" } });
    expect(orderRefused.statusCode).toBe(400);
    expect(orderRefused.json().code).toBe("refused");

    const orderBad = await app.inject({ method: "POST", url: `/api/v1/crm/orders/${ORDER_ID}/status`, headers: asOwner, payload: { status: "unknown" } });
    expect(orderBad.statusCode).toBe(400);
    expect(orderBad.json().code).toBe("badData");
  });

  it("каталог WhatsApp и корзина в чате (3 маршрута): 200, 400 refused и 503 при сбое шлюза", async () => {
    const cat = await app.inject({ method: "GET", url: "/api/v1/crm/catalog/for-chat", headers: asOwner });
    expect(cat.statusCode).toBe(200);
    expect(cat.json().enabled).toBe(true);
    expect(cat.headers.etag).toBeTruthy();

    ports.chatProducts.mockRejectedValueOnce(new Error("GOWA timeout"));
    const catDown = await app.inject({ method: "GET", url: "/api/v1/crm/catalog/for-chat", headers: asOwner });
    expect(catDown.statusCode).toBe(503);
    expect(catDown.headers["cache-control"]).toBe("no-store");
    expect(catDown.json()).toEqual({ error: admin.mobileCatalogDown, code: "serviceUnavailable" });

    // Отправка конкретного товара и ссылки на весь каталог
    const sendProd = await app.inject({ method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/catalog`, headers: asOwner, payload: { productId: "101" } });
    expect(sendProd.statusCode).toBe(200);
    expect(ports.sendProduct).toHaveBeenCalledWith(expect.anything(), CHAT_ID, "101");

    const sendLink = await app.inject({ method: "POST", url: `/api/v1/crm/chats/${CHAT_ID}/catalog`, headers: asOwner, payload: {} });
    expect(sendLink.statusCode).toBe(200);
    expect(ports.sendCatalogLink).toHaveBeenCalledWith(expect.anything(), CHAT_ID);

    const ord = await app.inject({ method: "GET", url: `/api/v1/crm/chat-messages/${MSG_ID}/order`, headers: asOwner });
    expect(ord.statusCode).toBe(200);
    expect(ord.json()).toEqual({ items: [{ name: "Книга А5", quantity: 1, price: 29000 }], total: 29000, currency: "KZT" });
  });

  it("чаты, сообщения, пересылка и голосовые (15 маршрутов): 200, blocked, multipart voice, 404/403/400", async () => {
    expect((await injectSample("crmChatOpen", asOwner)).json()).toEqual({ ok: true, id: CHAT_ID });
    expect((await injectSample("crmChatForwardTargets", asOwner)).json().targets).toHaveLength(1);
    expect((await injectSample("crmChatAssign", asOwner)).json()).toEqual({ ok: true });
    expect((await injectSample("crmChatCreateDeal", asOwner)).json()).toEqual({ id: DEAL_ID });
    expect((await injectSample("crmChatNote", asOwner)).json()).toEqual({ id: MSG_ID });
    expect((await injectSample("crmChatPin", asOwner)).json()).toEqual({ ok: true });
    expect((await injectSample("crmChatRead", asOwner)).json()).toEqual({ ok: true });
    expect((await injectSample("crmChatStatus", asOwner)).json()).toEqual({ ok: true });
    expect((await injectSample("crmChatMessageEdit", asOwner)).json()).toEqual({ ok: true });
    expect((await injectSample("crmChatMessageDelete", asOwner)).json()).toEqual({ ok: true });
    expect((await injectSample("crmChatMessageResend", asOwner)).json()).toEqual({ ok: true });
    expect((await injectSample("crmChatMessageTranscribe", asOwner)).json()).toEqual({ text: "Хочу заказать книгу маме" });

    // Пересылка: частичный успех и полный отказ
    ports.forwardMessage
      .mockResolvedValueOnce({ sent: 1, failed: [{ title: "Дина", error: "Шлюз занят" }] })
      .mockResolvedValueOnce({ error: "Сообщение не найдено" });
    const fwdPartial = await app.inject({
      method: "POST",
      url: `/api/v1/crm/chats/${CHAT_ID}/forward`,
      headers: asOwner,
      payload: { messageIds: [MSG_ID, MSG_ID_2], targetIds: [TARGET_CHAT_ID] },
    });
    expect(fwdPartial.statusCode).toBe(200);
    expect(fwdPartial.json()).toEqual({
      ok: true,
      forwarded: 1,
      total: 2,
      failed: ["Дина — Шлюз занят", "Сообщение не найдено"],
    });

    ports.forwardMessage.mockResolvedValueOnce({ error: "Сообщение не найдено" });
    const fwdAllFail = await app.inject({
      method: "POST",
      url: `/api/v1/crm/chats/${CHAT_ID}/forward`,
      headers: asOwner,
      payload: { messageIds: [MSG_ID], targetIds: [TARGET_CHAT_ID] },
    });
    expect(fwdAllFail.statusCode).toBe(400);
    expect(fwdAllFail.json()).toEqual({ error: "Сообщение не найдено", code: "refused" });

    // Отправка сообщения: обычная и заблокированная фильтром реквизитов
    const sent = await injectSample("crmChatSendMessage", asOwner);
    expect(sent.statusCode).toBe(200);
    expect(sent.json()).toEqual({ id: MSG_ID, status: "sent", error: null, blocked: null });

    ports.sendMessage.mockResolvedValueOnce({ blocked: "В сообщении номер карты" });
    const blocked = await injectSample("crmChatSendMessage", asOwner);
    expect(blocked.statusCode).toBe(200);
    expect(blocked.json()).toEqual({ id: null, status: null, error: null, blocked: "В сообщении номер карты" });

    // Голосовое сообщение: конвертация ogg, fallback без ffmpeg, 404, 403 чужой чат, 400 пустая запись, 400 не multipart
    const voiceMp = multipartVoice({ filename: "clip.m4a", mime: "audio/mp4", data: Buffer.from("m4a-data") });
    const voiceOk = await app.inject({
      method: "POST",
      url: `/api/v1/crm/chats/${CHAT_ID}/voice?replyToId=${REPLY_ID}`,
      headers: { ...asSales, ...voiceMp.headers },
      payload: voiceMp.payload,
    });
    expect(voiceOk.statusCode).toBe(200);
    expect(voiceOk.json()).toEqual({ id: MSG_ID, status: "sent", error: null, converted: true });
    expect(ports.sendUpload).toHaveBeenCalledWith(
      CHAT_ID,
      expect.objectContaining({ name: "voice.ogg", mime: "audio/ogg; codecs=opus" }),
      "",
      SALES.id,
      { replyToId: REPLY_ID },
    );

    ports.convertAudio.mockResolvedValueOnce(null);
    const voiceRaw = await app.inject({
      method: "POST",
      url: `/api/v1/crm/chats/${CHAT_ID}/voice`,
      headers: { ...asSales, ...voiceMp.headers },
      payload: voiceMp.payload,
    });
    expect(voiceRaw.statusCode).toBe(200);
    expect(voiceRaw.json().converted).toBe(false);
    expect(ports.sendUpload).toHaveBeenLastCalledWith(
      CHAT_ID,
      expect.objectContaining({ name: "clip.m4a", mime: "audio/mp4" }),
      "",
      SALES.id,
      { replyToId: null },
    );

    ports.findConversation.mockResolvedValueOnce(null);
    const voice404 = await app.inject({
      method: "POST",
      url: `/api/v1/crm/chats/${CHAT_ID}/voice`,
      headers: { ...asSales, ...voiceMp.headers },
      payload: voiceMp.payload,
    });
    expect(voice404.statusCode).toBe(404);
    expect(voice404.json().code).toBe("notFound");

    ports.findConversation.mockResolvedValueOnce({ id: CHAT_ID, assigneeId: OWNER.id });
    const voice403 = await app.inject({
      method: "POST",
      url: `/api/v1/crm/chats/${CHAT_ID}/voice`,
      headers: { ...asSales, ...voiceMp.headers },
      payload: voiceMp.payload,
    });
    expect(voice403.statusCode).toBe(403);
    expect(voice403.json().code).toBe("forbidden");

    const emptyMp = multipartVoice();
    const voiceEmpty = await app.inject({
      method: "POST",
      url: `/api/v1/crm/chats/${CHAT_ID}/voice`,
      headers: { ...asSales, ...emptyMp.headers },
      payload: emptyMp.payload,
    });
    expect(voiceEmpty.statusCode).toBe(400);
    expect(voiceEmpty.json()).toEqual({ error: admin.mobileEmptyRecording, code: "refused" });

    const voiceBadCt = await app.inject({
      method: "POST",
      url: `/api/v1/crm/chats/${CHAT_ID}/voice`,
      headers: asSales,
      payload: { text: "not multipart" },
    });
    expect(voiceBadCt.statusCode).toBe(400);
    expect(voiceBadCt.json().code).toBe("badRequest");
  });

  it("сделки (7 маршрутов): создание через NEXT_REDIRECT, принятие, передача, перенос, заметка, отказ и задача", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/crm/deals",
      headers: asOwner,
      payload: { title: "Сделка с сайта", contactName: "Асель", amount: 29000 },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toEqual({ ok: true, id: DEAL_ID });
    const passedDealForm = ports.createDeal.mock.calls[0]?.[1];
    expect(passedDealForm?.get("title")).toBe("Сделка с сайта");
    expect(passedDealForm?.get("amount")).toBe("29000");

    ports.createDeal.mockResolvedValueOnce({ error: "Проверьте номер телефона" });
    const createRefused = await app.inject({ method: "POST", url: "/api/v1/crm/deals", headers: asOwner, payload: { title: "Сделка" } });
    expect(createRefused.statusCode).toBe(400);
    expect(createRefused.json()).toEqual({ error: "Проверьте номер телефона", code: "refused" });

    expect((await injectSample("crmDealAccept", asOwner)).json()).toEqual({ ok: true });
    expect((await injectSample("crmDealAssign", asOwner)).json()).toEqual({ ok: true });
    expect((await injectSample("crmDealMove", asOwner)).json()).toEqual({ ok: true });

    const noteRes = await injectSample("crmDealNote", asOwner);
    expect(noteRes.statusCode).toBe(200);
    const noteForm = ports.addNote.mock.calls[0]?.[1];
    expect(noteForm?.get("dealId")).toBe(DEAL_ID);
    expect(noteForm?.get("text")).toBe("Клиент ждёт звонка");

    const rej = await app.inject({ method: "POST", url: `/api/v1/crm/deals/${DEAL_ID}/reject`, headers: asOwner, payload: {} });
    expect(rej.statusCode).toBe(200);
    expect(rej.json()).toEqual({ requested: false, message: "Заявка отклонена", deleted: true });
    expect(ports.rejectDeal).toHaveBeenCalledWith(expect.anything(), DEAL_ID, false, "");

    const dealTask = await app.inject({
      method: "POST",
      url: `/api/v1/crm/deals/${DEAL_ID}/tasks`,
      headers: asNoPerms,
      payload: { title: "Позвонить клиенту", dueAt: "2026-11-30", dueTime: "15:00", kind: "call" },
    });
    expect(dealTask.statusCode).toBe(200);
    const dealTaskForm = ports.createTask.mock.calls[0]?.[1];
    expect(dealTaskForm?.get("dealId")).toBe(DEAL_ID);
    expect(dealTaskForm?.get("dueAt")).toBe("2026-11-30");
    expect(dealTaskForm?.get("dueTime")).toBe("15:00");
    expect(dealTaskForm?.get("kind")).toBe("call");
  });

  it("задачи (7 маршрутов): создание с remindBeforeMin=null -> 'none', карточка + ETag/404, правка, удаление, выполнение, отложить, toggle", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/crm/tasks",
      headers: asOwner,
      payload: { title: "Согласовать макет", remindBeforeMin: null, kind: "message" },
    });
    expect(createRes.statusCode).toBe(200);
    expect(ports.createTask.mock.calls[0]?.[1].get("remindBeforeMin")).toBe("none");

    const got = await app.inject({ method: "GET", url: `/api/v1/crm/tasks/${TASK_ID}`, headers: asOwner });
    expect(got.statusCode).toBe(200);
    expect(got.json().task.id).toBe(TASK_ID);
    const got304 = await app.inject({ method: "GET", url: `/api/v1/crm/tasks/${TASK_ID}`, headers: { ...asOwner, "if-none-match": String(got.headers.etag) } });
    expect(got304.statusCode).toBe(304);

    ports.taskDetail.mockResolvedValueOnce(null);
    const got404 = await app.inject({ method: "GET", url: `/api/v1/crm/tasks/${TASK_ID}`, headers: asOwner });
    expect(got404.statusCode).toBe(404);
    expect(got404.json().code).toBe("notFound");

    expect((await injectSample("crmTaskUpdate", asOwner)).json()).toEqual({ ok: true });
    expect((await injectSample("crmTaskDelete", asOwner)).json()).toEqual({ ok: true });
    expect((await injectSample("crmTaskComplete", asOwner)).json()).toEqual({ ok: true });
    expect((await injectSample("crmTaskSnooze", asOwner)).json()).toEqual({ ok: true });
    expect((await injectSample("crmTaskToggle", asOwner)).json()).toEqual({ ok: true });

    ports.snoozeTask.mockResolvedValueOnce({ error: admin.taskForbidden });
    const snoozeRefused = await injectSample("crmTaskSnooze", asOwner);
    expect(snoozeRefused.statusCode).toBe(400);
    expect(snoozeRefused.json()).toEqual({ error: admin.taskForbidden, code: "refused" });
  });
});
