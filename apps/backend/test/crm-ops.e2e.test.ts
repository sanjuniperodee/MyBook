import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { StaffResolver } from "@/modules/access/application/services";
import { AccessError, Role, type RoleRepository } from "@/modules/access/domain";
import { BoardsError, type BoardSummary, type BoardView, type CardDetail, type CardSummary } from "@/modules/boards";
import { IdentityError, isPhoneEmail } from "@/modules/identity";
import { financePeriod } from "@/modules/reporting/ui/finance-screen";
import type { Ticket } from "@/modules/support";
import { CLIENT_IP_HEADER, CLIENT_IP_SIG_HEADER, signClientIp } from "@/shared/clientIp";
import { encodeWire } from "@/shared/wire";
import { STAFF_ACCESS, type StaffAccessPort } from "../src/core/auth/staff";
import {
  CRM_OPS_PORTS,
  type CrmBookListRow,
  type CrmOpsPorts,
  type RoleWithMembersRow,
  type SalesAnalyticsData,
} from "../src/modules/crm-ops/crm-ops.tokens";
import { bootTestApp, sessionOf, testUser } from "./app";

const EDGE_SECRET = "crm-ops-edge-secret-0123456789";
const ORIGIN = "http://localhost:3000";

const BOARD_ID = "11111111-1111-4111-8111-111111111101";
const COL_ID = "11111111-1111-4111-8111-111111111102";
const CARD_ID = "11111111-1111-4111-8111-111111111103";
const LABEL_ID = "11111111-1111-4111-8111-111111111104";
const CHECKLIST_ID = "11111111-1111-4111-8111-111111111105";
const ITEM_ID = "11111111-1111-4111-8111-111111111106";
const COMMENT_ID = "11111111-1111-4111-8111-111111111107";
const FILE_ID = "11111111-1111-4111-8111-111111111108";
const CLIENT_ID = "11111111-1111-4111-8111-111111111109";
const BOOK_ID = "11111111-1111-4111-8111-111111111110";
const DEAL_ID = "11111111-1111-4111-8111-111111111111";
const TICKET_ID = "11111111-1111-4111-8111-111111111112";
const ROLE_MANAGER_ID = "22222222-2222-4222-8222-222222222201";
const ROLE_CUSTOM_ID = "22222222-2222-4222-8222-222222222202";
const PIPELINE_ID = "33333333-3333-4333-8333-333333333301";
const STAGE_ID = "33333333-3333-4333-8333-333333333302";

const OWNER = testUser("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", {
  name: "Директор",
  email: "owner@mybooks.kz",
  role: "admin",
  totpEnabledAt: new Date("2026-10-15T10:00:00Z"),
  totpSecret: "SECRET",
  totpBackup: ["hash1", "hash2"],
});
const MANAGER = testUser("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", {
  name: "Алия",
  email: "manager@mybooks.kz",
  role: "admin",
  crmRoleId: ROLE_MANAGER_ID,
  totpEnabledAt: new Date("2026-10-20T10:00:00Z"),
  totpSecret: "SECRET",
  totpBackup: ["hash3"],
});
const MANAGER_NO_2FA = testUser("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", {
  name: "Дана",
  email: "no2fa@mybooks.kz",
  role: "admin",
  crmRoleId: ROLE_MANAGER_ID,
});
const DISABLED_STAFF = testUser("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4", {
  name: "Бывший",
  email: "old@mybooks.kz",
  role: "admin",
  staffDisabled: true,
});
const REGULAR_USER = testUser("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5", {
  name: "Клиент",
  email: "client@example.kz",
  role: "user",
});

let ipAllowlist = "";
let require2fa = false;

const managerRole = Role.restore(ROLE_MANAGER_ID, {
  name: "Менеджер",
  scope: "own",
  permissions: ["deals.view"],
  key: null,
});

const roleRepo: RoleRepository = {
  nextId: () => ROLE_CUSTOM_ID,
  findById: async (id) => (id === ROLE_MANAGER_ID ? managerRole : null),
  findByKey: async () => null,
  assignedCount: async () => 0,
  add: async () => {},
  save: async () => {},
  remove: async () => {},
};

const staffResolver = new StaffResolver(
  roleRepo,
  { load: async () => ({ allowlist: ipAllowlist, require2fa }), save: async () => {} },
  { isPhoneEmail },
);

const staffAccess: StaffAccessPort = {
  async resolve(user, ip) {
    const account = {
      id: user.id,
      role: user.role,
      staffDisabled: user.staffDisabled,
      crmRoleId: user.crmRoleId,
      twoFactorEnabled: Boolean(user.totpEnabledAt && user.totpSecret),
    };
    const context = await staffResolver.resolve(account);
    if (!context) return null;
    const gate = await staffResolver.gate(account, ip);
    return { context, gate };
  },
};

const cardSummaryFixture: CardSummary = {
  id: CARD_ID,
  title: "Позвонить клиенту",
  kind: "call",
  boardId: BOARD_ID,
  columnId: COL_ID,
  position: 1000,
  priority: "high",
  startAt: "2026-11-26T09:00:00.000Z",
  dueAt: "2026-11-27T12:00:00.000Z",
  doneAt: null,
  archived: false,
  cover: { color: "wine" },
  assigneeIds: [OWNER.id],
  watcherIds: [OWNER.id],
  labelIds: [LABEL_ID],
  checklist: { done: 1, total: 2 },
  comments: 1,
  attachments: 1,
  hasDescription: true,
  recurring: false,
  estimateMin: 60,
  spentMin: 15,
  links: [{ type: "deal", id: DEAL_ID, label: "Сделка #42", href: `/admin/deals/${DEAL_ID}` }],
  linkLabel: "Сделка #42",
  fromBot: false,
  editable: true,
};

const boardSummaryFixture: BoardSummary = {
  id: BOARD_ID,
  name: "Задачи отдела",
  description: "Основная доска",
  kind: "team",
  department: null,
  color: "wine",
  visibility: "all",
  isDefault: true,
  ownerId: OWNER.id,
  canManage: true,
  openCards: 3,
};

const boardViewFixture: BoardView = {
  board: {
    id: BOARD_ID,
    name: "Задачи отдела",
    description: "Основная доска",
    kind: "team",
    department: null,
    color: "wine",
    visibility: "all",
    isDefault: true,
    ownerId: OWNER.id,
    canManage: true,
  },
  columns: [{ id: COL_ID, name: "В работе", position: 0, color: null, done: false, wipLimit: 5 }],
  labels: [{ id: LABEL_ID, name: "Срочно", color: "danger" }],
  members: [{ userId: OWNER.id, role: "admin" }],
  rules: [],
  cards: [cardSummaryFixture],
  doneDays: 90,
};

const cardDetailFixture: CardDetail = {
  ...cardSummaryFixture,
  description: "Уточнить адрес доставки",
  createdById: OWNER.id,
  createdAt: "2026-11-25T10:00:00.000Z",
  updatedAt: "2026-11-26T09:15:00.000Z",
  remindBeforeMin: 30,
  result: "",
  recurrence: null,
  meet: false,
  meetUrl: null,
  board: { id: BOARD_ID, name: "Задачи отдела" },
  columns: [{ id: COL_ID, name: "В работе", done: false }],
  labels: [{ id: LABEL_ID, name: "Срочно", color: "danger" }],
  checklists: [
    {
      id: CHECKLIST_ID,
      title: "Чек-лист",
      items: [{ id: ITEM_ID, text: "Проверить телефон", done: true, doneById: OWNER.id, assigneeId: OWNER.id, dueAt: null }],
    },
  ],
  commentList: [
    { id: COMMENT_ID, authorId: OWNER.id, text: "Ждём ответ", createdAt: "2026-11-26T09:10:00.000Z", editedAt: null, mine: true },
  ],
  files: [
    {
      id: FILE_ID,
      name: "brief.pdf",
      mime: "application/pdf",
      size: 1024,
      url: `/api/admin/boards/files/${FILE_ID}`,
      isImage: false,
      uploadedById: OWNER.id,
      createdAt: "2026-11-26T09:15:00.000Z",
    },
  ],
  activity: [{ id: "11111111-1111-4111-8111-111111111199", actorId: OWNER.id, kind: "created", data: {}, createdAt: "2026-11-25T10:00:00.000Z" }],
  dealId: DEAL_ID,
  orderId: null,
  clientId: CLIENT_ID,
  bookId: null,
  conversationId: null,
};

const bookRowFixture: CrmBookListRow = {
  book: {
    id: BOOK_ID,
    title: "Книга для мамы",
    theme: "mom",
    authorName: "Алия",
    recipientName: "Мама",
    status: "draft",
    occasion: "birthday",
    occasionDate: "2026-12-20",
    updatedAt: new Date(Date.now() - 10 * 86_400_000),
  },
  owner: {
    id: CLIENT_ID,
    email: "aliya@example.kz",
    name: "Алия",
    remindedAt: null,
  },
  answered: 12,
  total: 40,
  words: 900,
  photos: 4,
  hasOrder: false,
  deal: { id: DEAL_ID, number: 42 },
};

const ticketFixture = (createdBy: string): Ticket => ({
  id: TICKET_ID,
  number: 77,
  status: "new",
  kind: "bug",
  urgency: "urgent",
  description: "Не открывается фото",
  place: "/books",
  expected: "Фото открывается",
  summary: "Суть: Фото не загружается\nПодробности",
  reporterName: "Алия",
  notifyPhone: "+77001112233",
  clientPhone: "+77001112233",
  device: "iOS",
  userAgent: "TestAgent",
  createdBy,
  processedAttempts: 1,
  processedAt: new Date("2026-11-26T08:01:00.000Z"),
  resolvedAt: null,
  attachments: [
    {
      id: "att-1",
      key: "support/t/1.ogg",
      name: "voice.ogg",
      mime: "audio/ogg",
      size: 4096,
      kind: "audio",
      recorded: true,
      transcript: "Не грузится фото",
    },
  ],
  chat: {
    conversationId: "44444444-4444-4444-8444-444444444401",
    contact: "Алия",
    chatId: "77001112233@c.us",
    messages: [{ id: "m1", direction: "in", type: "text", text: "Здравствуйте", at: "2026-11-26T08:00:00.000Z" }],
  },
  resolution: "",
  devNote: "Секретная заметка разработчика",
  commits: [{ sha: "abcdef1", subject: "fix", at: "2026-11-26T09:00:00.000Z", release: "v1" }],
  history: [{ at: "2026-11-26T08:05:00.000Z", by: "Алия", text: "Создано" }],
  notifiedAt: null,
  notifyError: null,
  createdAt: new Date("2026-11-26T08:00:00.000Z"),
  updatedAt: new Date("2026-11-26T08:05:00.000Z"),
});

const roleRowsFixture: RoleWithMembersRow[] = [
  {
    role: { id: ROLE_MANAGER_ID, name: "Менеджер", scope: "own", permissions: ["deals.view"], key: null },
    members: 2,
  },
  {
    role: { id: ROLE_CUSTOM_ID, name: "Руководитель", scope: "all", permissions: [], key: "owner" },
    members: 1,
  },
];

const analyticsDataFixture = (): SalesAnalyticsData => {
  const period = financePeriod({ preset: "month", now: new Date("2026-11-26T10:00:00Z"), tz: "Asia/Almaty" });
  return {
    pipelines: [{ id: PIPELINE_ID, name: "Основная" }],
    pipeline: { id: PIPELINE_ID, name: "Основная" },
    period,
    showProfit: true,
    flow: { incoming: 200000, refunds: 10000, fees: 4000, tax: 6000, net: 180000, other: 20000, profit: 160000, revenue: 190000, prevRevenue: 100000 },
    resp: {
      total: { asked: 10, answered: 9, unanswered: 1, median: 8, inSla: 0.9 },
      bot: { first: 4, median: 1 },
      byAuthor: new Map([[OWNER.id, { answered: 5, median: 6, inSla: 1 }]]),
      longest: [{ conversationId: "conv-1", asked: new Date("2026-11-26T08:00:00Z"), minutes: 25, answered: true }],
    },
    sla: 15,
    shift: 540,
    workMins: (m) => (m === null ? "—" : `${m} мин`),
    share: (x) => (x === null ? "—" : `${Math.round(x * 100)}%`),
    t: { revenue: 150000, repeat_revenue: 30000, created: 20, repeat_created: 3, won: 5, repeat_won: 1, cycle: 3600 },
    p: { revenue: 100000, created: 10, won: 4 },
    channelRows: [{ key: "whatsapp", label: "WhatsApp", created: 12, won: 4, revenue: 120000 }],
    c: { incoming: 8, outgoing: 12, missed: 1, handled: 1, talk: 600 },
    team: [
      {
        id: OWNER.id,
        name: "Директор",
        deals: 10,
        won: 4,
        revenue: 120000,
        received: 100000,
        open: 3,
        messages: 50,
        phone_messages: 10,
        calls: 8,
        talk: 300,
        tasks_done: 7,
        tasks_overdue: 1,
        resp: { answered: 5, median: 6, inSla: 1 },
      },
    ],
    inWork: 6,
    planPct: () => "80%",
    base: 20,
    funnel: [{ st: { id: STAGE_ID, name: "Новая", kind: "open" }, n: 20, prevN: null, time: { avg_sec: 1800 } }],
    lost: { rows: [{ reason: "Дорого", n: 2 }] },
    awaiting: { rows: [{ n: 3 }] },
  };
};

function makeMultipart(field: string, filename: string, contentType: string, content: string | Buffer) {
  const boundary = "----CrmOpsTestBoundary";
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`),
    Buffer.isBuffer(content) ? content : Buffer.from(content),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { contentType: `multipart/form-data; boundary=${boundary}`, body };
}

const mocks = {
  listBoards: vi.fn<CrmOpsPorts["listBoards"]>(),
  viewBoard: vi.fn<CrmOpsPorts["viewBoard"]>(),
  createCard: vi.fn<CrmOpsPorts["createCard"]>(),
  cardSummary: vi.fn<CrmOpsPorts["cardSummary"]>(),
  cardDetail: vi.fn<CrmOpsPorts["cardDetail"]>(),
  updateCard: vi.fn<CrmOpsPorts["updateCard"]>(),
  removeCard: vi.fn<CrmOpsPorts["removeCard"]>(),
  moveCard: vi.fn<CrmOpsPorts["moveCard"]>(),
  setCardDone: vi.fn<CrmOpsPorts["setCardDone"]>(),
  archiveCard: vi.fn<CrmOpsPorts["archiveCard"]>(),
  setCardAssignees: vi.fn<CrmOpsPorts["setCardAssignees"]>(),
  setCardWatching: vi.fn<CrmOpsPorts["setCardWatching"]>(),
  setCardLabel: vi.fn<CrmOpsPorts["setCardLabel"]>(),
  addChecklist: vi.fn<CrmOpsPorts["addChecklist"]>(),
  addChecklistItem: vi.fn<CrmOpsPorts["addChecklistItem"]>(),
  updateChecklistItem: vi.fn<CrmOpsPorts["updateChecklistItem"]>(),
  deleteChecklistItem: vi.fn<CrmOpsPorts["deleteChecklistItem"]>(),
  commentCard: vi.fn<CrmOpsPorts["commentCard"]>(),
  attachCardFile: vi.fn<CrmOpsPorts["attachCardFile"]>(),
  calendarRange: vi.fn<CrmOpsPorts["calendarRange"]>(),
  runCrmOp: vi.fn<CrmOpsPorts["runCrmOp"]>(),
  runCrmAction: vi.fn<CrmOpsPorts["runCrmAction"]>(),
  bookList: vi.fn<CrmOpsPorts["bookList"]>(),
  remindMany: vi.fn<CrmOpsPorts["remindMany"]>(),
  supportList: vi.fn<CrmOpsPorts["supportList"]>(),
  supportCounts: vi.fn<CrmOpsPorts["supportCounts"]>(),
  supportTicketByNumber: vi.fn<CrmOpsPorts["supportTicketByNumber"]>(),
  supportUpdate: vi.fn<CrmOpsPorts["supportUpdate"]>(),
  supportNotify: vi.fn<CrmOpsPorts["supportNotify"]>(),
  allStaff: vi.fn<CrmOpsPorts["allStaff"]>(),
  getSetting: vi.fn<CrmOpsPorts["getSetting"]>(),
  listFields: vi.fn<CrmOpsPorts["listFields"]>(),
  salesRegister: vi.fn<CrmOpsPorts["salesRegister"]>(),
  setPayForm: vi.fn<CrmOpsPorts["setPayForm"]>(),
  loadSalesAnalytics: vi.fn<CrmOpsPorts["loadSalesAnalytics"]>(),
  leadStats: vi.fn<CrmOpsPorts["leadStats"]>(),
  mergeClosedDays: vi.fn<CrmOpsPorts["mergeClosedDays"]>(),
  saveCrmSettings: vi.fn<CrmOpsPorts["saveCrmSettings"]>(),
  saveBot: vi.fn<CrmOpsPorts["saveBot"]>(),
  rolesWithMembers: vi.fn<CrmOpsPorts["rolesWithMembers"]>(),
  saveRole: vi.fn<CrmOpsPorts["saveRole"]>(),
  deleteRole: vi.fn<CrmOpsPorts["deleteRole"]>(),
  twoFactorStatus: vi.fn<CrmOpsPorts["twoFactorStatus"]>(),
  beginTwoFactor: vi.fn<CrmOpsPorts["beginTwoFactor"]>(),
  confirmTwoFactor: vi.fn<CrmOpsPorts["confirmTwoFactor"]>(),
  newBackupCodes: vi.fn<CrmOpsPorts["newBackupCodes"]>(),
  disableTwoFactor: vi.fn<CrmOpsPorts["disableTwoFactor"]>(),
  saveSecurity: vi.fn<CrmOpsPorts["saveSecurity"]>(),
  resetStaffTwoFactor: vi.fn<CrmOpsPorts["resetStaffTwoFactor"]>(),
} satisfies CrmOpsPorts;

const settingsMap: Record<string, string> = {
  "finance.fees": '{"Kaspi Gold": 0.95}',
  "crm.slaMinutes": "15",
  "crm.workHours": JSON.stringify({ days: [1, 2, 3, 4, 5], from: "09:00", to: "18:00", off: ["2026-12-16"] }),
  "crm.autoDealFrom": "book_started",
  "crm.unsorted": "on",
  "crm.maxDiscount": "10",
  "widget.enabled": "on",
  "widget.chat": "on",
  "crm.reassignMinutes": "20",
  "crm.digest": "on",
  "referral.chatReward": "on",
  "widget.help": "off",
  "notify.auto": "on",
  "bot.mode": "fallback",
  "bot.config": "{}",
  "security.require2fa": "off",
  "security.ipAllowlist": "198.51.100.0/24",
};

const authOf = (u: typeof OWNER) => ({ cookie: `mb_session=${sessionOf(u)}` });
const signedIp = (ip: string) => ({ [CLIENT_IP_HEADER]: ip, [CLIENT_IP_SIG_HEADER]: signClientIp(ip, EDGE_SECRET) });

let app: NestFastifyApplication;

beforeAll(async () => {
  ({ app } = await bootTestApp({
    users: [OWNER, MANAGER, MANAGER_NO_2FA, DISABLED_STAFF, REGULAR_USER],
    env: { NODE_ENV: "test", EDGE_IP_SECRET: EDGE_SECRET },
    overrides: [
      [STAFF_ACCESS, staffAccess],
      [CRM_OPS_PORTS, mocks],
    ],
  }));
});

afterAll(() => app.close());

beforeEach(() => {
  vi.clearAllMocks();
  ipAllowlist = "";
  require2fa = false;

  mocks.listBoards.mockResolvedValue([boardSummaryFixture]);
  mocks.viewBoard.mockResolvedValue(boardViewFixture);
  mocks.createCard.mockResolvedValue(CARD_ID);
  mocks.cardSummary.mockResolvedValue(cardSummaryFixture);
  mocks.cardDetail.mockResolvedValue(cardDetailFixture);
  mocks.updateCard.mockResolvedValue(undefined);
  mocks.removeCard.mockResolvedValue(undefined);
  mocks.moveCard.mockResolvedValue(undefined);
  mocks.setCardDone.mockResolvedValue(undefined);
  mocks.archiveCard.mockResolvedValue(undefined);
  mocks.setCardAssignees.mockResolvedValue(undefined);
  mocks.setCardWatching.mockResolvedValue(undefined);
  mocks.setCardLabel.mockResolvedValue(undefined);
  mocks.addChecklist.mockResolvedValue(CHECKLIST_ID);
  mocks.addChecklistItem.mockResolvedValue(ITEM_ID);
  mocks.updateChecklistItem.mockResolvedValue(undefined);
  mocks.deleteChecklistItem.mockResolvedValue(undefined);
  mocks.commentCard.mockResolvedValue(COMMENT_ID);
  mocks.attachCardFile.mockResolvedValue(FILE_ID);
  mocks.calendarRange.mockResolvedValue([cardSummaryFixture]);

  mocks.runCrmOp.mockResolvedValue({ count: 3, when: new Date("2026-11-26T10:00:00Z") });
  mocks.runCrmAction.mockResolvedValue({ ok: true });

  mocks.bookList.mockResolvedValue([bookRowFixture]);
  mocks.remindMany.mockResolvedValue({ sent: 1, skipped: 0 });

  mocks.supportList.mockResolvedValue([ticketFixture(MANAGER.id)]);
  mocks.supportCounts.mockResolvedValue({ new: 1, in_progress: 0, waiting: 0, done: 0, rejected: 0 });
  mocks.supportTicketByNumber.mockResolvedValue(ticketFixture(MANAGER.id));
  mocks.supportUpdate.mockResolvedValue({ ok: true, notified: true });
  mocks.supportNotify.mockResolvedValue({ ok: true, notified: true });

  mocks.allStaff.mockResolvedValue([
    { id: OWNER.id, name: OWNER.name, email: OWNER.email, disabled: false },
    { id: MANAGER.id, name: MANAGER.name, email: MANAGER.email, disabled: false },
  ]);
  mocks.getSetting.mockImplementation(async (key) => settingsMap[key] ?? "");
  mocks.listFields.mockResolvedValue([]);
  mocks.salesRegister.mockResolvedValue([
    {
      id: DEAL_ID,
      number: 42,
      createdAt: new Date("2026-11-20T09:00:00Z"),
      soldAt: new Date("2026-11-21T09:00:00Z"),
      source: "whatsapp",
      utm: null,
      assigneeId: OWNER.id,
      client: "Алия",
      phone: "+77001234567",
      plan: "hardcover",
      recipient: "Мама",
      eventDate: "2026-12-20",
      payForm: "Kaspi Gold",
      price: 39900,
      dealPaid: 39900,
      method: "kaspi",
      stage: "Оплачено",
      stageKind: "won",
      orderId: null,
      orderNumber: null,
      orderStatus: null,
      city: "Алматы",
      desiredDate: null,
      orderDue: null,
      orderPaid: 0,
      quantity: 1,
      chars: 0,
    },
  ]);
  mocks.setPayForm.mockResolvedValue({ ok: true });
  mocks.loadSalesAnalytics.mockResolvedValue(analyticsDataFixture());
  mocks.leadStats.mockResolvedValue({
    deals: [
      {
        id: DEAL_ID,
        number: 42,
        createdAt: new Date("2026-11-20T09:00:00Z"),
        source: "whatsapp",
        entry: "whatsapp",
        utm: null,
        assigneeId: OWNER.id,
        amount: 39900,
        lostReason: null,
        closedAt: null,
        repeat: false,
        recipient: "Мама",
        occasion: "День рождения",
        eventDate: "2026-12-20",
        stageId: STAGE_ID,
        stage: "Оплачено",
        stageKind: "won",
        stagePosition: 1,
        pipeline: "Основная",
        firstPaidAt: new Date("2026-11-21T09:00:00Z"),
        firstAmount: 39900,
        paid: 39900,
      },
    ],
    payments: [
      {
        dealId: DEAL_ID,
        assigneeId: OWNER.id,
        amount: 39900,
        dealCreatedAt: new Date("2026-11-20T09:00:00Z"),
        at: new Date("2026-11-21T09:00:00Z"),
        first: 39900,
      },
    ],
    invoices: [{ at: new Date("2026-11-20T10:00:00Z"), assigneeId: OWNER.id }],
    spend: [{ day: "2026-11-20", amount: 5000 }],
  });
  mocks.mergeClosedDays.mockResolvedValue(30);
  mocks.saveCrmSettings.mockResolvedValue({ ok: "Сохранено" });
  mocks.saveBot.mockResolvedValue({ ok: "Сохранено" });

  mocks.rolesWithMembers.mockResolvedValue(roleRowsFixture);
  mocks.saveRole.mockResolvedValue({ ok: "Роль сохранена" });
  mocks.deleteRole.mockResolvedValue(undefined);
  mocks.twoFactorStatus.mockResolvedValue([
    { id: OWNER.id, name: OWNER.name, email: OWNER.email, totpEnabledAt: OWNER.totpEnabledAt, staffDisabled: false },
    { id: MANAGER.id, name: MANAGER.name, email: MANAGER.email, totpEnabledAt: MANAGER.totpEnabledAt, staffDisabled: false },
  ]);
  mocks.beginTwoFactor.mockResolvedValue({
    secret: "JBSWY3DPEHPK3PXP",
    otpauthUrl: "otpauth://totp/MyBooks:owner@mybooks.kz?secret=JBSWY3DPEHPK3PXP&issuer=MyBooks",
  });
  mocks.confirmTwoFactor.mockResolvedValue({ ok: true, codes: ["AAAA-1111", "BBBB-2222"] });
  mocks.newBackupCodes.mockResolvedValue({ ok: true, codes: ["CCCC-3333"] });
  mocks.disableTwoFactor.mockResolvedValue({ ok: true });
  mocks.saveSecurity.mockResolvedValue({ ok: "Сохранено" });
  mocks.resetStaffTwoFactor.mockResolvedValue({ ok: true });
});

describe("Контекст 5A-1: доски задач (19 маршрутов)", () => {
  it("проверяет все 19 маршрутов досок на 200, ETag/304 и multipart-загрузку", async () => {
    const h = { ...authOf(OWNER), origin: ORIGIN };

    const list = await app.inject({ method: "GET", url: "/api/v1/boards", headers: h });
    expect(list.statusCode).toBe(200);
    expect(list.json().boards).toHaveLength(1);
    const list304 = await app.inject({ method: "GET", url: "/api/v1/boards", headers: { ...h, "if-none-match": String(list.headers.etag) } });
    expect(list304.statusCode).toBe(304);

    const detail = await app.inject({ method: "GET", url: `/api/v1/boards/${BOARD_ID}?done=1`, headers: h });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().board.id).toBe(BOARD_ID);
    expect(detail.json().staff).toHaveLength(2);
    expect(mocks.viewBoard).toHaveBeenCalledWith(expect.objectContaining({ userId: OWNER.id, manageBoards: true }), BOARD_ID, { done: true });

    const created = await app.inject({ method: "POST", url: "/api/v1/cards", headers: h, payload: { title: "Новая задача", boardId: BOARD_ID } });
    expect(created.statusCode).toBe(200);
    expect(created.json().id).toBe(CARD_ID);

    const card = await app.inject({ method: "GET", url: `/api/v1/cards/${CARD_ID}`, headers: h });
    expect(card.statusCode).toBe(200);
    expect(card.json().card.id).toBe(CARD_ID);
    expect(card.json().checklists).toHaveLength(1);

    expect((await app.inject({ method: "PATCH", url: `/api/v1/cards/${CARD_ID}`, headers: h, payload: { title: "Обновлено" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "DELETE", url: `/api/v1/cards/${CARD_ID}`, headers: h })).json()).toEqual({ ok: true });
    expect((await app.inject({ method: "POST", url: `/api/v1/cards/${CARD_ID}/move`, headers: h, payload: { columnId: COL_ID } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: `/api/v1/cards/${CARD_ID}/done`, headers: h, payload: { done: true, result: "Готово" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: `/api/v1/cards/${CARD_ID}/archive`, headers: h, payload: { archived: true } })).json()).toEqual({ ok: true });
    expect((await app.inject({ method: "PUT", url: `/api/v1/cards/${CARD_ID}/assignees`, headers: h, payload: { userIds: [OWNER.id] } })).statusCode).toBe(200);
    expect((await app.inject({ method: "PUT", url: `/api/v1/cards/${CARD_ID}/watch`, headers: h, payload: { on: true } })).json()).toEqual({ ok: true });
    expect((await app.inject({ method: "PUT", url: `/api/v1/cards/${CARD_ID}/labels/${LABEL_ID}`, headers: h, payload: { on: true } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: `/api/v1/cards/${CARD_ID}/checklists`, headers: h, payload: { title: "Список", items: ["A"] } })).json()).toEqual({ id: CHECKLIST_ID });
    expect((await app.inject({ method: "POST", url: `/api/v1/checklists/${CHECKLIST_ID}/items`, headers: h, payload: { text: "Пункт" } })).json()).toEqual({ id: ITEM_ID });
    expect((await app.inject({ method: "PATCH", url: `/api/v1/checklist-items/${ITEM_ID}`, headers: h, payload: { done: true } })).json()).toEqual({ ok: true });
    expect((await app.inject({ method: "DELETE", url: `/api/v1/checklist-items/${ITEM_ID}`, headers: h })).json()).toEqual({ ok: true });
    expect((await app.inject({ method: "POST", url: `/api/v1/cards/${CARD_ID}/comments`, headers: h, payload: { text: "Комментарий" } })).json()).toEqual({ id: COMMENT_ID });

    const mp = makeMultipart("file", "doc.pdf", "application/pdf", "PDF-BYTES");
    const uploaded = await app.inject({
      method: "POST",
      url: `/api/v1/cards/${CARD_ID}/files`,
      headers: { ...h, "content-type": mp.contentType },
      payload: mp.body,
    });
    expect(uploaded.statusCode).toBe(200);
    expect(uploaded.json()).toEqual({ id: FILE_ID });
    expect(mocks.attachCardFile).toHaveBeenCalledWith(expect.anything(), CARD_ID, expect.objectContaining({ name: "doc.pdf", type: "application/pdf" }));

    const cal = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/calendar?from=2026-11-01T00:00:00Z&to=2026-11-30T23:59:59Z&boardId=${BOARD_ID}&mine=1`,
      headers: h,
    });
    expect(cal.statusCode).toBe(200);
    expect(cal.json().cards).toHaveLength(1);
  });

  it("обрабатывает BoardsError, пустой файл multipart, 400, 405 и права", async () => {
    const h = { ...authOf(OWNER), origin: ORIGIN };

    mocks.cardDetail.mockRejectedValueOnce(new BoardsError("notFound", "Карточка не найдена"));
    const notFound = await app.inject({ method: "GET", url: `/api/v1/cards/${CARD_ID}`, headers: h });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.headers["cache-control"]).toBe("no-store");
    expect(notFound.json()).toEqual({ error: "Карточка не найдена", code: "notFound" });

    mocks.attachCardFile.mockRejectedValueOnce(new BoardsError("tooLarge", "Файл больше 25 МБ"));
    const mp = makeMultipart("file", "big.bin", "application/octet-stream", "123");
    const big = await app.inject({ method: "POST", url: `/api/v1/cards/${CARD_ID}/files`, headers: { ...h, "content-type": mp.contentType }, payload: mp.body });
    expect(big.statusCode).toBe(400);
    expect(big.headers["cache-control"]).toBe("no-store");
    expect(big.json()).toEqual({ error: "Файл больше 25 МБ", code: "tooLarge" });

    mocks.cardDetail.mockRejectedValueOnce(new BoardsError("forbidden", "Нет доступа"));
    const forbiddenBoard = await app.inject({ method: "GET", url: `/api/v1/cards/${CARD_ID}`, headers: h });
    expect(forbiddenBoard.statusCode).toBe(403);
    expect(forbiddenBoard.headers["cache-control"]).toBe("no-store");
    expect(forbiddenBoard.json()).toEqual({ error: "Нет доступа", code: "forbidden" });

    const emptyMp = makeMultipart("other", "ignored.txt", "text/plain", "x");
    const noFile = await app.inject({ method: "POST", url: `/api/v1/cards/${CARD_ID}/files`, headers: { ...h, "content-type": emptyMp.contentType }, payload: emptyMp.body });
    expect(noFile.statusCode).toBe(400);
    expect(noFile.json()).toEqual({ error: "Выберите файл", code: "invalid" });

    const notMp = await app.inject({ method: "POST", url: `/api/v1/cards/${CARD_ID}/files`, headers: h, payload: {} });
    expect(notMp.statusCode).toBe(400);
    expect(notMp.json().code).toBe("badRequest");

    expect((await app.inject({ method: "GET", url: "/api/v1/boards/bad-uuid", headers: h })).statusCode).toBe(400);
    const wrongMethod = await app.inject({ method: "DELETE", url: "/api/v1/boards", headers: h });
    expect(wrongMethod.statusCode).toBe(405);
    expect(wrongMethod.headers.allow).toBe("GET");
  });
});

describe("Контекст 5A-1: веб-CRM (3 маршрута)", () => {
  it("webCrmStaff возвращает права сотрудника, gate 2fa/ip и null для не-сотрудника", async () => {
    const ok = await app.inject({ method: "GET", url: "/api/v1/web/crm/staff", headers: authOf(OWNER) });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ staff: { roleName: "Руководитель", isOwner: true, scope: "all" }, gate: null });

    const regular = await app.inject({ method: "GET", url: "/api/v1/web/crm/staff", headers: authOf(REGULAR_USER) });
    expect(regular.statusCode).toBe(200);
    expect(regular.json()).toEqual({ staff: null, gate: null });

    require2fa = true;
    const need2fa = await app.inject({ method: "GET", url: "/api/v1/web/crm/staff", headers: authOf(MANAGER_NO_2FA) });
    expect(need2fa.statusCode).toBe(200);
    expect(need2fa.json()).toMatchObject({ staff: { roleName: "Менеджер", isOwner: false }, gate: "2fa" });

    ipAllowlist = "198.51.100.0/24";
    const blockedIp = await app.inject({
      method: "GET",
      url: "/api/v1/web/crm/staff",
      headers: { ...authOf(OWNER), ...signedIp("203.0.113.5") },
    });
    expect(blockedIp.statusCode).toBe(200);
    expect(blockedIp.json().gate).toBe("ip");
  });

  it("webCrmRead и webCrmAct передают gate/ip/staff, кодируют wire и ловят NEXT_REDIRECT / NEXT_NOT_FOUND", async () => {
    require2fa = true;
    const h = { ...authOf(MANAGER_NO_2FA), origin: ORIGIN, ...signedIp("198.51.100.8") };
    const args = await encodeWire({ at: new Date("2026-11-26T00:00:00Z") });

    const read = await app.inject({ method: "POST", url: "/api/v1/web/crm/read/shell.layout", headers: h, payload: { args } });
    expect(read.statusCode).toBe(200);
    expect(mocks.runCrmOp).toHaveBeenCalledWith(
      expect.objectContaining({ ip: "198.51.100.8", gate: "2fa", user: expect.objectContaining({ id: MANAGER_NO_2FA.id }) }),
      "shell.layout",
      { at: new Date("2026-11-26T00:00:00Z") },
    );

    const act = await app.inject({ method: "POST", url: "/api/v1/web/crm/act/security.confirmTwoFactorAction", headers: h, payload: { args: ["123456"] } });
    expect(act.statusCode).toBe(200);
    expect(act.json()).toEqual({ data: { ok: true } });

    mocks.runCrmAction.mockRejectedValueOnce(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/admin/deals/1;307;" }));
    const redir = await app.inject({ method: "POST", url: "/api/v1/web/crm/act/deals.create", headers: h, payload: { args: [] } });
    expect(redir.statusCode).toBe(200);
    expect(redir.json()).toEqual({ data: null, redirect: "/admin/deals/1" });

    mocks.runCrmAction.mockRejectedValueOnce(Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }));
    const nf1 = await app.inject({ method: "POST", url: "/api/v1/web/crm/act/deals.delete", headers: h, payload: { args: [] } });
    expect(nf1.statusCode).toBe(200);
    expect(nf1.json()).toEqual({ data: null, notFound: true });

    mocks.runCrmAction.mockRejectedValueOnce(Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_NOT_FOUND" }));
    const nf2 = await app.inject({ method: "POST", url: "/api/v1/web/crm/act/deals.delete", headers: h, payload: { args: [] } });
    expect(nf2.statusCode).toBe(200);
    expect(nf2.json()).toEqual({ data: null, notFound: true });

    expect((await app.inject({ method: "POST", url: "/api/v1/web/crm/read/bad-op", headers: h, payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/api/v1/web/crm/read/shell.layout", headers: h })).statusCode).toBe(405);
  });
});

describe("Контекст 5A-1: книги (2) и поддержка (4)", () => {
  it("crmBooks, crmBooksRemind проверяют права clients.view / clients.edit и отдают 200 / ETag / 403", async () => {
    const ownerH = { ...authOf(OWNER), origin: ORIGIN };
    const mgrH = { ...authOf(MANAGER), origin: ORIGIN };

    const books = await app.inject({ method: "GET", url: "/api/v1/crm/books?f=stalled&theme=mom", headers: ownerH });
    expect(books.statusCode).toBe(200);
    expect(books.json().rows).toHaveLength(1);
    expect(books.json().remindable).toEqual([CLIENT_ID]);
    expect(books.json().canRemind).toBe(true);

    expect((await app.inject({ method: "GET", url: "/api/v1/crm/books", headers: mgrH })).statusCode).toBe(403);

    const remind = await app.inject({ method: "POST", url: "/api/v1/crm/books/remind", headers: ownerH, payload: { clientIds: [CLIENT_ID] } });
    expect(remind.statusCode).toBe(200);
    expect(remind.json()).toEqual({ sent: 1, skipped: 0 });
    expect((await app.inject({ method: "POST", url: "/api/v1/crm/books/remind", headers: mgrH, payload: { clientIds: [CLIENT_ID] } })).statusCode).toBe(403);
  });

  it("crmSupport*: руководитель видит все и devNote, менеджер — только свои (чужое → 404), refused при отказе", async () => {
    const ownerH = { ...authOf(OWNER), origin: ORIGIN };
    const mgrH = { ...authOf(MANAGER), origin: ORIGIN };

    const listOwner = await app.inject({ method: "GET", url: "/api/v1/crm/support?status=new&q=фото", headers: ownerH });
    expect(listOwner.statusCode).toBe(200);
    expect(listOwner.json().canManage).toBe(true);
    expect(mocks.supportList).toHaveBeenCalledWith({ status: "new", q: "фото", createdBy: undefined, limit: 200 });

    const listMgr = await app.inject({ method: "GET", url: "/api/v1/crm/support?status=unknown", headers: mgrH });
    expect(listMgr.statusCode).toBe(200);
    expect(listMgr.json().canManage).toBe(false);
    expect(mocks.supportList).toHaveBeenLastCalledWith({ status: "open", q: "", createdBy: MANAGER.id, limit: 200 });

    const ownTicket = await app.inject({ method: "GET", url: "/api/v1/crm/support/77", headers: mgrH });
    expect(ownTicket.statusCode).toBe(200);
    expect(ownTicket.json().devNote).toBe("");
    expect(ownTicket.json().canManage).toBe(false);

    const ownerTicket = await app.inject({ method: "GET", url: "/api/v1/crm/support/77", headers: ownerH });
    expect(ownerTicket.statusCode).toBe(200);
    expect(ownerTicket.json().devNote).toBe("Секретная заметка разработчика");

    mocks.supportTicketByNumber.mockResolvedValueOnce(ticketFixture(OWNER.id));
    expect((await app.inject({ method: "GET", url: "/api/v1/crm/support/77", headers: mgrH })).statusCode).toBe(404);

    const badStatus = await app.inject({
      method: "PATCH",
      url: "/api/v1/crm/support/77",
      headers: ownerH,
      payload: { status: "wrong", resolution: "", devNote: "", notify: false },
    });
    expect(badStatus.statusCode).toBe(400);
    expect(badStatus.json()).toEqual({ error: "Выберите статус из списка", code: "refused" });

    const updated = await app.inject({
      method: "PATCH",
      url: "/api/v1/crm/support/77",
      headers: ownerH,
      payload: { status: "done", resolution: "Исправлено", devNote: "ok", notify: true },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toEqual({ ok: true, message: "Сохранено, автору написали" });

    mocks.supportNotify.mockResolvedValueOnce({ ok: false, error: "Нет номера" });
    const notifyFail = await app.inject({ method: "POST", url: "/api/v1/crm/support/77/notify", headers: ownerH });
    expect(notifyFail.statusCode).toBe(400);
    expect(notifyFail.json()).toEqual({ error: "Нет номера", code: "refused" });

    const notifyOk = await app.inject({ method: "POST", url: "/api/v1/crm/support/77/notify", headers: ownerH });
    expect(notifyOk.statusCode).toBe(200);
    expect(notifyOk.json()).toEqual({ ok: true, message: "Автору написали" });
  });
});

describe("Контекст 5A-1: аналитика (4) и настройки (3)", () => {
  it("crmSalesRegister, crmSalesPayForm, crmAnalytics, crmLeadStats — 200, refused и 403", async () => {
    const ownerH = { ...authOf(OWNER), origin: ORIGIN };
    const mgrH = { ...authOf(MANAGER), origin: ORIGIN };

    const reg = await app.inject({ method: "GET", url: "/api/v1/crm/sales?p=month", headers: ownerH });
    expect(reg.statusCode).toBe(200);
    expect(reg.json().showFees).toBe(true);
    expect(reg.json().rows).toHaveLength(1);
    expect((await app.inject({ method: "GET", url: "/api/v1/crm/sales", headers: mgrH })).statusCode).toBe(403);

    const payOk = await app.inject({ method: "PUT", url: `/api/v1/crm/sales/${DEAL_ID}/pay-form`, headers: ownerH, payload: { form: "Kaspi Gold" } });
    expect(payOk.statusCode).toBe(200);
    expect(payOk.json()).toEqual({ ok: true, message: "Форма оплаты: Kaspi Gold" });

    mocks.setPayForm.mockResolvedValueOnce({ ok: false, error: "Чужая сделка" });
    const payFail = await app.inject({ method: "PUT", url: `/api/v1/crm/sales/${DEAL_ID}/pay-form`, headers: ownerH, payload: { form: "" } });
    expect(payFail.statusCode).toBe(400);
    expect(payFail.json()).toEqual({ error: "Чужая сделка", code: "refused" });

    const an = await app.inject({ method: "GET", url: "/api/v1/crm/analytics?p=month", headers: ownerH });
    expect(an.statusCode).toBe(200);
    expect(an.json().pipelineId).toBe(PIPELINE_ID);
    expect(an.json().flow?.profit).toBe(160000);

    const leads = await app.inject({ method: "GET", url: `/api/v1/crm/leads?p=month&m=${OWNER.id}`, headers: ownerH });
    expect(leads.statusCode).toBe(200);
    expect(leads.json().showSpend).toBe(true);
    expect(leads.json().managerId).toBe(OWNER.id);
  });

  it("crmSettingsSales, crmSettingsSalesSave, crmSettingsBotMode — 200, refused и 403", async () => {
    const ownerH = { ...authOf(OWNER), origin: ORIGIN };
    const mgrH = { ...authOf(MANAGER), origin: ORIGIN };

    const get = await app.inject({ method: "GET", url: "/api/v1/crm/settings/sales", headers: ownerH });
    expect(get.statusCode).toBe(200);
    expect(get.json()).toMatchObject({ slaMinutes: 15, off: "16.12.2026", mergeClosedDays: 30, botMode: "fallback" });
    expect((await app.inject({ method: "GET", url: "/api/v1/crm/settings/sales", headers: mgrH })).statusCode).toBe(403);

    const saveBody = {
      workDays: [1, 2, 3, 4, 5],
      from: "09:00",
      to: "18:00",
      off: "16.12.2026",
      slaMinutes: 15,
      reassignMinutes: 10,
      autoDealFrom: "book_started",
      mergeClosedDays: 30,
      maxDiscount: 10,
      unsorted: true,
      digest: true,
      autoLetters: true,
      chatReward: false,
      widgetEnabled: true,
      widgetChat: true,
      widgetHelp: false,
    };
    const saved = await app.inject({ method: "PUT", url: "/api/v1/crm/settings/sales", headers: ownerH, payload: saveBody });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({ ok: true, message: "Сохранено" });

    mocks.saveCrmSettings.mockResolvedValueOnce({ error: "Неверная дата" });
    const badSave = await app.inject({ method: "PUT", url: "/api/v1/crm/settings/sales", headers: ownerH, payload: saveBody });
    expect(badSave.statusCode).toBe(400);
    expect(badSave.json()).toEqual({ error: "Неверная дата", code: "refused" });

    const bot = await app.inject({ method: "PUT", url: "/api/v1/crm/settings/bot-mode", headers: ownerH, payload: { mode: "always" } });
    expect(bot.statusCode).toBe(200);
    expect(bot.json()).toEqual({ ok: true, message: "AI-продажник: всегда сразу" });
  });
});

describe("Контекст 5A-1: роли и безопасность / 2FA (10 маршрутов)", () => {
  it("crmRoles, crmRoleSave, crmRoleDelete — 200, refused (AccessError), 403", async () => {
    const ownerH = { ...authOf(OWNER), origin: ORIGIN };
    const mgrH = { ...authOf(MANAGER), origin: ORIGIN };

    const roles = await app.inject({ method: "GET", url: "/api/v1/crm/roles", headers: ownerH });
    expect(roles.statusCode).toBe(200);
    expect(roles.json().roles).toHaveLength(2);
    expect((await app.inject({ method: "GET", url: "/api/v1/crm/roles", headers: mgrH })).statusCode).toBe(403);

    const save = await app.inject({
      method: "POST",
      url: "/api/v1/crm/roles",
      headers: ownerH,
      payload: { name: "Поддержка", scope: "all", permissions: ["chats.view"] },
    });
    expect(save.statusCode).toBe(200);
    expect(save.json()).toEqual({ ok: true, message: "Роль сохранена" });

    const del = await app.inject({ method: "DELETE", url: `/api/v1/crm/roles/${ROLE_CUSTOM_ID}`, headers: ownerH });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ ok: true, message: "Роль удалена" });

    mocks.deleteRole.mockRejectedValueOnce(new AccessError("systemRole", "Системную роль удалить нельзя"));
    const delRefused = await app.inject({ method: "DELETE", url: `/api/v1/crm/roles/${ROLE_CUSTOM_ID}`, headers: ownerH });
    expect(delRefused.statusCode).toBe(400);
    expect(delRefused.json()).toEqual({ error: "Системную роль удалить нельзя", code: "refused" });
  });

  it("crmSecurity*: 200, 2FA-гейт и @AllowUnconfigured2fa, IP-гейт, refused, 401/403/405", async () => {
    const ownerH = { ...authOf(OWNER), origin: ORIGIN, ...signedIp("198.51.100.7") };
    const mgrH = { ...authOf(MANAGER), origin: ORIGIN };

    const sec = await app.inject({ method: "GET", url: "/api/v1/crm/security", headers: ownerH });
    expect(sec.statusCode).toBe(200);
    expect(sec.json()).toMatchObject({ enabled: true, currentIp: "198.51.100.7", canManage: true, backupLeft: 2 });

    const start = await app.inject({ method: "POST", url: "/api/v1/crm/security/2fa/start", headers: ownerH });
    expect(start.statusCode).toBe(200);
    expect(start.json().qrDataUrl).toMatch(/^data:image\/png;base64,/);

    mocks.beginTwoFactor.mockRejectedValueOnce(new IdentityError("twoFactorAlreadyOn"));
    const startRefused = await app.inject({ method: "POST", url: "/api/v1/crm/security/2fa/start", headers: ownerH });
    expect(startRefused.statusCode).toBe(400);
    expect(startRefused.json().code).toBe("refused");

    expect((await app.inject({ method: "POST", url: "/api/v1/crm/security/2fa/confirm", headers: ownerH, payload: { code: "123456" } })).json()).toEqual({ codes: ["AAAA-1111", "BBBB-2222"] });
    expect((await app.inject({ method: "POST", url: "/api/v1/crm/security/2fa/backup", headers: ownerH, payload: { code: "123456" } })).json()).toEqual({ codes: ["CCCC-3333"] });
    expect((await app.inject({ method: "POST", url: "/api/v1/crm/security/2fa/disable", headers: ownerH, payload: { code: "123456" } })).json()).toEqual({ ok: true, message: "2FA отключена" });
    expect((await app.inject({ method: "PATCH", url: "/api/v1/crm/security/rules", headers: ownerH, payload: { require2fa: true } })).json()).toEqual({ ok: true, message: "Сохранено" });
    expect((await app.inject({ method: "POST", url: `/api/v1/crm/security/staff/${MANAGER.id}/reset-2fa`, headers: ownerH })).json()).toEqual({ ok: true, message: "2FA сброшена" });

    // Без права team.manage/settings.manage — 403
    expect((await app.inject({ method: "PATCH", url: "/api/v1/crm/security/rules", headers: mgrH, payload: { require2fa: true } })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: `/api/v1/crm/security/staff/${OWNER.id}/reset-2fa`, headers: mgrH })).statusCode).toBe(403);

    // Обязательная 2FA: сотрудник без 2FA проходит только @AllowUnconfigured2fa (security, 2fa/start, 2fa/confirm).
    require2fa = true;
    const no2faH = { ...authOf(MANAGER_NO_2FA), origin: ORIGIN };
    expect((await app.inject({ method: "GET", url: "/api/v1/crm/security", headers: no2faH })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/v1/crm/security/2fa/start", headers: no2faH })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/v1/crm/security/2fa/confirm", headers: no2faH, payload: { code: "123456" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/v1/crm/security/2fa/backup", headers: no2faH, payload: { code: "123456" } })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/api/v1/crm/security/2fa/disable", headers: no2faH, payload: { code: "123456" } })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/api/v1/boards", headers: no2faH })).statusCode).toBe(403);

    // IP allowlist блокирует даже @AllowUnconfigured2fa
    ipAllowlist = "198.51.100.0/24";
    expect((await app.inject({ method: "GET", url: "/api/v1/crm/security", headers: { ...no2faH, ...signedIp("203.0.113.9") } })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/api/v1/crm/security", headers: { ...no2faH, ...signedIp("198.51.100.9") } })).statusCode).toBe(200);

    // 401, отключённый сотрудник, не-сотрудник, чужой Origin, 405
    ipAllowlist = "";
    require2fa = false;
    expect((await app.inject({ method: "GET", url: "/api/v1/crm/security" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/v1/crm/security", headers: authOf(REGULAR_USER) })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/api/v1/crm/security", headers: authOf(DISABLED_STAFF) })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/api/v1/crm/security/2fa/start", headers: { ...authOf(OWNER), origin: "https://evil.example" } })).statusCode).toBe(403);
    const badMethod = await app.inject({ method: "DELETE", url: "/api/v1/crm/security", headers: ownerH });
    expect(badMethod.statusCode).toBe(405);
    expect(badMethod.headers.allow).toBe("GET");
  });
});
