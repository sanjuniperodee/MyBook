import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, beforeEach, describe, it, vi } from "vitest";
import { AccessError } from "@/modules/access/domain";
import { StaffContext } from "@/modules/access/domain/StaffContext";
import { BoardsError, type BoardSummary, type BoardView, type CardDetail, type CardSummary } from "@/modules/boards";
import { IdentityError, isPhoneEmail, type CurrentUser } from "@/modules/identity";
import { financePeriod } from "@/modules/reporting/ui/finance-screen";
import type { Ticket } from "@/modules/support";
import { CLIENT_IP_HEADER, CLIENT_IP_SIG_HEADER, clientIpFrom, signClientIp } from "@/shared/clientIp";
import { allPermissions, type Permission } from "@/shared/domain/permissions";
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

const EDGE_SECRET = "parity-crm-ops-secret-0123456789";
const ORIGIN = "http://localhost:3000";

const BOARD_ID = "11111111-1111-4111-8111-111111111201";
const COL_ID = "11111111-1111-4111-8111-111111111202";
const CARD_ID = "11111111-1111-4111-8111-111111111203";
const LABEL_ID = "11111111-1111-4111-8111-111111111204";
const CHECKLIST_ID = "11111111-1111-4111-8111-111111111205";
const ITEM_ID = "11111111-1111-4111-8111-111111111206";
const COMMENT_ID = "11111111-1111-4111-8111-111111111207";
const FILE_ID = "11111111-1111-4111-8111-111111111208";
const CLIENT_ID = "11111111-1111-4111-8111-111111111209";
const BOOK_ID = "11111111-1111-4111-8111-111111111210";
const DEAL_ID = "11111111-1111-4111-8111-111111111211";
const TICKET_ID = "11111111-1111-4111-8111-111111111212";
const ROLE_ID = "22222222-2222-4222-8222-222222222211";
const ROLE_OWNER_ID = "22222222-2222-4222-8222-222222222212";
const PIPELINE_ID = "33333333-3333-4333-8333-333333333211";
const STAGE_ID = "33333333-3333-4333-8333-333333333212";

const OWNER = testUser("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", {
  name: "Директор",
  email: "owner@mybooks.kz",
  role: "admin",
  totpEnabledAt: new Date("2026-10-15T10:00:00Z"),
  totpSecret: "SECRET",
  totpBackup: ["b1", "b2"],
});
const MANAGER = testUser("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2", {
  name: "Алия",
  email: "aliya@mybooks.kz",
  role: "admin",
  crmRoleId: ROLE_ID,
  totpEnabledAt: new Date("2026-10-20T10:00:00Z"),
  totpSecret: "SECRET",
  totpBackup: ["b3"],
});
const REGULAR = testUser("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3", {
  name: "Клиент",
  email: "client@example.kz",
  role: "user",
});

const USERS: CurrentUser[] = [OWNER, MANAGER, REGULAR];

const cardSummaryFixture: CardSummary = {
  id: CARD_ID,
  title: "Проверить заказ",
  kind: "task",
  boardId: BOARD_ID,
  columnId: COL_ID,
  position: 1000,
  priority: "normal",
  startAt: "2026-11-26T09:00:00.000Z",
  dueAt: "2026-11-28T12:00:00.000Z",
  doneAt: null,
  archived: false,
  cover: { color: "teal" },
  assigneeIds: [OWNER.id],
  watcherIds: [OWNER.id],
  labelIds: [LABEL_ID],
  checklist: { done: 0, total: 1 },
  comments: 1,
  attachments: 1,
  hasDescription: true,
  recurring: false,
  estimateMin: 30,
  spentMin: 10,
  links: [],
  linkLabel: null,
  fromBot: false,
  editable: true,
};

const boardSummaryFixture: BoardSummary = {
  id: BOARD_ID,
  name: "Доска CRM",
  description: null,
  kind: "team",
  department: null,
  color: "wine",
  visibility: "all",
  isDefault: true,
  ownerId: OWNER.id,
  canManage: true,
  openCards: 1,
};

const boardViewFixture: BoardView = {
  board: {
    id: BOARD_ID,
    name: "Доска CRM",
    description: null,
    kind: "team",
    department: null,
    color: "wine",
    visibility: "all",
    isDefault: true,
    ownerId: OWNER.id,
    canManage: true,
  },
  columns: [{ id: COL_ID, name: "Новые", position: 0, color: null, done: false, wipLimit: null }],
  labels: [{ id: LABEL_ID, name: "VIP", color: "wine" }],
  members: [{ userId: OWNER.id, role: "admin" }],
  rules: [],
  cards: [cardSummaryFixture],
  doneDays: 90,
};

const cardDetailFixture: CardDetail = {
  ...cardSummaryFixture,
  description: "Описание карточки",
  createdById: OWNER.id,
  createdAt: "2026-11-25T10:00:00.000Z",
  updatedAt: "2026-11-26T09:15:00.000Z",
  remindBeforeMin: 60,
  result: "",
  recurrence: null,
  meet: false,
  meetUrl: null,
  board: { id: BOARD_ID, name: "Доска CRM" },
  columns: [{ id: COL_ID, name: "Новые", done: false }],
  labels: [{ id: LABEL_ID, name: "VIP", color: "wine" }],
  checklists: [
    {
      id: CHECKLIST_ID,
      title: "Чек-лист",
      items: [{ id: ITEM_ID, text: "Шаг 1", done: false, doneById: null, assigneeId: null, dueAt: null }],
    },
  ],
  commentList: [{ id: COMMENT_ID, authorId: OWNER.id, text: "Готово", createdAt: "2026-11-26T09:10:00.000Z", editedAt: null, mine: true }],
  files: [
    {
      id: FILE_ID,
      name: "pic.png",
      mime: "image/png",
      size: 2048,
      url: `/api/admin/boards/files/${FILE_ID}`,
      isImage: true,
      uploadedById: OWNER.id,
      createdAt: "2026-11-26T09:15:00.000Z",
    },
  ],
  activity: [{ id: "11111111-1111-4111-8111-111111111299", actorId: OWNER.id, kind: "created", data: {}, createdAt: "2026-11-25T10:00:00.000Z" }],
  dealId: null,
  orderId: null,
  clientId: null,
  bookId: null,
  conversationId: null,
};

const bookRowFixture: CrmBookListRow = {
  book: {
    id: BOOK_ID,
    title: "Книга папе",
    theme: "dad",
    authorName: "Алия",
    recipientName: "Папа",
    status: "draft",
    occasion: "birthday",
    occasionDate: "2026-12-25",
    // «17 дней без правок» в снимке — от текущей даты: правка ровно 17 суток назад, иначе снимок ломается каждый день.
    updatedAt: new Date(Date.now() - 17 * 86_400_000),
  },
  owner: { id: CLIENT_ID, email: "client@example.kz", name: "Алия", remindedAt: null },
  answered: 10,
  total: 35,
  words: 600,
  photos: 2,
  hasOrder: false,
  deal: { id: DEAL_ID, number: 12 },
};

const ticketFixture: Ticket = {
  assist: null,
  id: TICKET_ID,
  number: 55,
  status: "new",
  kind: "bug",
  urgency: "normal",
  description: "Кнопка не отвечает",
  place: "/admin",
  expected: "Кнопка сохраняет",
  summary: "Суть: Кнопка не отвечает",
  reporterName: "Алия",
  notifyPhone: "+77001112233",
  clientPhone: "+77001112233",
  device: "iOS",
  userAgent: "TestAgent",
  createdBy: MANAGER.id,
  processedAttempts: 1,
  processedAt: new Date("2026-11-26T08:00:00.000Z"),
  resolvedAt: null,
  attachments: [],
  chat: null,
  resolution: "",
  devNote: "Заметка",
  commits: [],
  history: [{ at: "2026-11-26T08:00:00.000Z", by: "Алия", text: "Создано" }],
  notifiedAt: null,
  notifyError: null,
  createdAt: new Date("2026-11-26T08:00:00.000Z"),
  updatedAt: new Date("2026-11-26T08:00:00.000Z"),
};

const roleRowsFixture: RoleWithMembersRow[] = [
  { role: { id: ROLE_ID, name: "Менеджер", scope: "own", permissions: ["deals.view"], key: null }, members: 1 },
  { role: { id: ROLE_OWNER_ID, name: "Руководитель", scope: "all", permissions: [], key: "owner" }, members: 1 },
];

const salesAnalyticsFixture = (): SalesAnalyticsData => {
  const period = financePeriod({ preset: "custom", from: "2026-11-01", to: "2026-11-26", now: new Date("2026-11-26T10:00:00Z"), tz: "Asia/Almaty" });
  return {
    pipelines: [{ id: PIPELINE_ID, name: "Основная" }],
    pipeline: { id: PIPELINE_ID, name: "Основная" },
    period,
    showProfit: true,
    flow: { incoming: 100000, refunds: 0, fees: 1000, tax: 3000, net: 96000, other: 10000, profit: 86000, revenue: 100000, prevRevenue: 50000 },
    resp: {
      total: { asked: 5, answered: 5, unanswered: 0, median: 5, inSla: 1 },
      bot: { first: 2, median: 1 },
      byAuthor: new Map(),
      longest: [],
    },
    sla: 15,
    shift: 540,
    workMins: (m) => (m === null ? "—" : `${m} мин`),
    share: (x) => (x === null ? "—" : `${Math.round(x * 100)}%`),
    t: { revenue: 100000, repeat_revenue: 0, created: 10, repeat_created: 0, won: 3, repeat_won: 0, cycle: 1200 },
    p: { revenue: 50000, created: 5, won: 2 },
    channelRows: [{ key: "whatsapp", label: "WhatsApp", created: 10, won: 3, revenue: 100000 }],
    c: { incoming: 4, outgoing: 6, missed: 0, handled: 0, talk: 180 },
    team: [],
    inWork: 2,
    planPct: () => "—",
    base: 10,
    funnel: [{ st: { id: STAGE_ID, name: "Новая", kind: "open" }, n: 10, prevN: null, time: { avg_sec: 600 } }],
    lost: { rows: [] },
    awaiting: { rows: [{ n: 0 }] },
  };
};

const shared = vi.hoisted(() => ({
  boards: {
    list: vi.fn(),
    view: vi.fn(),
  },
  cards: {
    create: vi.fn(),
    summary: vi.fn(),
    detail: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    move: vi.fn(),
    setDone: vi.fn(),
    archive: vi.fn(),
    setAssignees: vi.fn(),
    setWatching: vi.fn(),
    setLabel: vi.fn(),
    addChecklist: vi.fn(),
    addItem: vi.fn(),
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
    comment: vi.fn(),
    attach: vi.fn(),
  },
  calendar: {
    range: vi.fn(),
  },
  runCrmOp: vi.fn(),
  runCrmAction: vi.fn(),
  bookList: vi.fn(),
  remindMany: vi.fn(),
  supportList: vi.fn(),
  supportCounts: vi.fn(),
  supportByNumber: vi.fn(),
  supportUpdate: vi.fn(),
  supportNotify: vi.fn(),
  allStaff: vi.fn(),
  getSetting: vi.fn(),
  listFields: vi.fn(),
  salesRegister: vi.fn(),
  setPayForm: vi.fn(),
  loadSalesAnalytics: vi.fn(),
  leadStats: vi.fn(),
  mergeClosedDays: vi.fn(),
  saveCrmSettings: vi.fn(),
  saveBot: vi.fn(),
  rolesWithMembers: vi.fn(),
  saveRole: vi.fn(),
  deleteRole: vi.fn(),
  twoFactorStatus: vi.fn(),
  beginTwoFactor: vi.fn(),
  confirmTwoFactor: vi.fn(),
  newBackupCodes: vi.fn(),
  disableTwoFactor: vi.fn(),
  saveSecurity: vi.fn(),
  resetStaffTwoFactor: vi.fn(),
}));

const staffContextOf = (user: CurrentUser): StaffContext | null => {
  if (user.role !== "admin" || user.staffDisabled) return null;
  if (!user.crmRoleId) {
    return new StaffContext(user.id, "Руководитель", "owner", "all", new Set<Permission>(allPermissions), true, { isPhoneEmail });
  }
  return new StaffContext(user.id, "Менеджер", null, "own", new Set<Permission>(["deals.view"]), false, { isPhoneEmail });
};

const staffObjectOf = (user: CurrentUser) => {
  const ctx = staffContextOf(user);
  if (!ctx) return null;
  return {
    user,
    roleName: ctx.roleName,
    roleKey: ctx.roleKey,
    scope: ctx.scope,
    permissions: ctx.permissions,
    isOwner: ctx.isOwner,
    context: ctx,
  };
};

vi.mock("@/server/auth", async () => {
  const { currentContext } = await import("@/shared/infrastructure/http/request-scope");
  const extract = (req: Request): CurrentUser | null => {
    const cookieHeader = req.headers.get("cookie") ?? "";
    let token: string | null = null;
    for (const part of cookieHeader.split(";")) {
      const eq = part.indexOf("=");
      if (eq > 0 && part.slice(0, eq).trim() === "mb_session") {
        token = decodeURIComponent(part.slice(eq + 1).trim());
        break;
      }
    }
    if (!token) token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? null;
    return token ? USERS.find((u) => sessionOf(u) === token) ?? null : null;
  };
  return {
    getCurrentUser: async () => extract(currentContext().request),
  };
});
vi.mock("@/server/rateLimit", async () => {
  const { currentContext } = await import("@/shared/infrastructure/http/request-scope");
  return {
    trustedClientIp: async () => clientIpFrom((name) => currentContext().request.headers.get(name), EDGE_SECRET),
    rateLimit: async () => true,
  };
});
vi.mock("@/server/access", async () => {
  const actual = await vi.importActual<typeof import("@/server/access")>("@/server/access");
  const { getCurrentUser } = await import("@/server/auth");
  return {
    ...actual,
    getStaff: async () => {
      const user = await getCurrentUser();
      return user ? staffObjectOf(user as unknown as CurrentUser) : null;
    },
    localStaffAccess: async (user: CurrentUser) => {
      const s = staffObjectOf(user);
      if (!s) return { staff: null, gate: null };
      return {
        staff: { roleName: s.roleName, roleKey: s.roleKey, scope: s.scope, permissions: [...s.permissions], isOwner: s.isOwner },
        gate: null,
      };
    },
  };
});
vi.mock("@/modules/workspace", () => ({
  getSetting: (key: string) => shared.getSetting(key),
  listFields: (entity: "deal" | "client") => shared.listFields(entity),
}));
vi.mock("@/server/container", () => ({
  container: () => ({
    boards: { boards: shared.boards, cards: shared.cards, calendar: shared.calendar },
    access: { queries: { allStaff: shared.allStaff, rolesWithMembers: shared.rolesWithMembers, twoFactorStatus: shared.twoFactorStatus } },
    reporting: { bookList: shared.bookList, salesRegister: shared.salesRegister, leadStats: shared.leadStats },
    support: { tickets: { list: shared.supportList, counts: shared.supportCounts, byNumber: shared.supportByNumber } },
    sales: { deals: { mergeClosedDays: shared.mergeClosedDays } },
    identity: { accounts: { beginTwoFactor: shared.beginTwoFactor } },
  }),
}));
vi.mock("@/server/crm-ops/registry", () => ({ runCrmOp: (op: string, args: unknown) => shared.runCrmOp(op, args) }));
vi.mock("@/server/crm-actions", () => ({ runCrmAction: (op: string, args: unknown) => shared.runCrmAction(op, args) }));
vi.mock("@/server/crm-actions/admin", () => ({ remindManyAction: (ids: string[]) => shared.remindMany(ids) }));
vi.mock("@/server/crm-actions/support", () => ({
  updateTicketAction: (n: number, input: unknown) => shared.supportUpdate(n, input),
  notifyTicketAction: (n: number, id: string) => shared.supportNotify(n, id),
}));
vi.mock("@/server/crm-actions/sales", () => ({ setPayFormAction: (dealId: string, form: string) => shared.setPayForm(dealId, form) }));
vi.mock("@/server/sales-analytics", async () => {
  const nums = await import("@/lib/crm/numbers");
  return { ...nums, loadSalesAnalytics: (_staff: unknown, q: unknown) => shared.loadSalesAnalytics(q) };
});
vi.mock("@/server/crm-actions/settings-crm", () => ({
  saveCrmSettingsAction: (_: unknown, form: FormData) => shared.saveCrmSettings(form),
  saveBotAction: (input: unknown) => shared.saveBot(input),
}));
vi.mock("@/server/crm-actions/team", () => ({
  saveRoleAction: (_: unknown, form: FormData) => shared.saveRole(form),
  deleteRoleAction: (roleId: string) => shared.deleteRole(roleId),
}));
vi.mock("@/server/crm-actions/security", () => ({
  confirmTwoFactorAction: (code: string) => shared.confirmTwoFactor(code),
  newBackupCodesAction: (code: string) => shared.newBackupCodes(code),
  disableTwoFactorAction: (code: string) => shared.disableTwoFactor(code),
  saveSecurityAction: (_: unknown, form: FormData) => shared.saveSecurity(form),
  resetStaffTwoFactorAction: (userId: string) => shared.resetStaffTwoFactor(userId),
}));

const { assertRoute } = await import("./expected");
const { HttpError } = await import("@/server/api");

const nestPorts: CrmOpsPorts = {
  listBoards: (v) => shared.boards.list(v),
  viewBoard: (v, id, opts) => shared.boards.view(v, id, opts),
  createCard: (v, input) => shared.cards.create(v, input),
  cardSummary: (v, id) => shared.cards.summary(v, id),
  cardDetail: (v, id) => shared.cards.detail(v, id),
  updateCard: (v, id, patch) => shared.cards.update(v, id, patch),
  removeCard: (v, id) => shared.cards.remove(v, id),
  moveCard: (v, id, input) => shared.cards.move(v, id, input),
  setCardDone: (v, id, done, result) => shared.cards.setDone(v, id, done, result),
  archiveCard: (v, id, archived) => shared.cards.archive(v, id, archived),
  setCardAssignees: (v, id, ids) => shared.cards.setAssignees(v, id, ids),
  setCardWatching: (v, id, uid, on) => shared.cards.setWatching(v, id, uid, on),
  setCardLabel: (v, id, lid, on) => shared.cards.setLabel(v, id, lid, on),
  addChecklist: (v, id, title, items) => shared.cards.addChecklist(v, id, title, items),
  addChecklistItem: (v, cid, text) => shared.cards.addItem(v, cid, text),
  updateChecklistItem: (v, iid, patch) => shared.cards.updateItem(v, iid, patch),
  deleteChecklistItem: (v, iid) => shared.cards.deleteItem(v, iid),
  commentCard: (v, id, text) => shared.cards.comment(v, id, text),
  attachCardFile: (v, id, file) => shared.cards.attach(v, id, file),
  calendarRange: (v, from, to, opts) => shared.calendar.range(v, from, to, opts),
  runCrmOp: (_call, op, args) => shared.runCrmOp(op, args),
  runCrmAction: (_call, op, args) => shared.runCrmAction(op, args),
  bookList: (f, opts) => shared.bookList(f, opts),
  remindMany: (_call, ids) => shared.remindMany(ids),
  supportList: (f) => shared.supportList(f),
  supportCounts: (mine) => shared.supportCounts(mine),
  supportTicketByNumber: (n) => shared.supportByNumber(n),
  supportUpdate: (_call, n, input) => shared.supportUpdate(n, input),
  supportNotify: (_call, n, id) => shared.supportNotify(n, id),
  allStaff: () => shared.allStaff(),
  getSetting: (k) => shared.getSetting(k),
  listFields: (e) => shared.listFields(e),
  salesRegister: (r) => shared.salesRegister(r),
  setPayForm: (_call, id, form) => shared.setPayForm(id, form),
  loadSalesAnalytics: (_call, _staff, q) => shared.loadSalesAnalytics(q),
  leadStats: (r) => shared.leadStats(r),
  mergeClosedDays: () => shared.mergeClosedDays(),
  saveCrmSettings: (_call, form) => shared.saveCrmSettings(form),
  saveBot: (_call, input) => shared.saveBot(input),
  rolesWithMembers: () => shared.rolesWithMembers(),
  saveRole: (_call, form) => shared.saveRole(form),
  deleteRole: (_call, id) => shared.deleteRole(id),
  twoFactorStatus: () => shared.twoFactorStatus(),
  beginTwoFactor: (uid) => shared.beginTwoFactor(uid),
  confirmTwoFactor: (_call, code) => shared.confirmTwoFactor(code),
  newBackupCodes: (_call, code) => shared.newBackupCodes(code),
  disableTwoFactor: (_call, code) => shared.disableTwoFactor(code),
  saveSecurity: (_call, form) => shared.saveSecurity(form),
  resetStaffTwoFactor: (_call, uid) => shared.resetStaffTwoFactor(uid),
};

const nestStaffAccess: StaffAccessPort = {
  async resolve(user) {
    const ctx = staffContextOf(user);
    return ctx ? { context: ctx, gate: null } : null;
  },
};

const settings: Record<string, string> = {
  "finance.fees": '{"Kaspi Gold": 0.95}',
  "crm.slaMinutes": "15",
  "crm.workHours": JSON.stringify({ days: [1, 2, 3, 4, 5], from: "09:00", to: "18:00", off: ["2026-12-16"] }),
  "crm.autoDealFrom": "book_started",
  "crm.unsorted": "on",
  "crm.maxDiscount": "10",
  "widget.enabled": "on",
  "widget.chat": "on",
  "crm.reassignMinutes": "15",
  "crm.digest": "on",
  "referral.chatReward": "off",
  "widget.help": "on",
  "notify.auto": "on",
  "bot.mode": "off",
  "bot.config": "{}",
  "security.require2fa": "off",
  "security.ipAllowlist": "198.51.100.0/24",
};

const ipHeaders = { [CLIENT_IP_HEADER]: "198.51.100.7", [CLIENT_IP_SIG_HEADER]: signClientIp("198.51.100.7", EDGE_SECRET) };
const asOwner = { cookie: `mb_session=${sessionOf(OWNER)}`, origin: ORIGIN, ...ipHeaders };
const asManager = { cookie: `mb_session=${sessionOf(MANAGER)}`, origin: ORIGIN, ...ipHeaders };
const asRegular = { cookie: `mb_session=${sessionOf(REGULAR)}`, origin: ORIGIN, ...ipHeaders };

function makeMultipart(field: string, filename: string, contentType: string, content: string) {
  const boundary = "----ParityBoundary5A1";
  const body = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n${content}\r\n--${boundary}--\r\n`,
  );
  return { contentType: `multipart/form-data; boundary=${boundary}`, body };
}

let app: NestFastifyApplication;

beforeAll(async () => {
  ({ app } = await bootTestApp({
    users: USERS,
    env: { NODE_ENV: "test", EDGE_IP_SECRET: EDGE_SECRET },
    overrides: [
      [STAFF_ACCESS, nestStaffAccess],
      [CRM_OPS_PORTS, nestPorts],
    ],
  }));
});

afterAll(() => app.close());

beforeEach(() => {
  vi.clearAllMocks();
  shared.boards.list.mockResolvedValue([boardSummaryFixture]);
  shared.boards.view.mockResolvedValue(boardViewFixture);
  shared.cards.create.mockResolvedValue(CARD_ID);
  shared.cards.summary.mockResolvedValue(cardSummaryFixture);
  shared.cards.detail.mockResolvedValue(cardDetailFixture);
  shared.cards.update.mockResolvedValue(undefined);
  shared.cards.remove.mockResolvedValue(undefined);
  shared.cards.move.mockResolvedValue(undefined);
  shared.cards.setDone.mockResolvedValue(undefined);
  shared.cards.archive.mockResolvedValue(undefined);
  shared.cards.setAssignees.mockResolvedValue(undefined);
  shared.cards.setWatching.mockResolvedValue(undefined);
  shared.cards.setLabel.mockResolvedValue(undefined);
  shared.cards.addChecklist.mockResolvedValue(CHECKLIST_ID);
  shared.cards.addItem.mockResolvedValue(ITEM_ID);
  shared.cards.updateItem.mockResolvedValue(undefined);
  shared.cards.deleteItem.mockResolvedValue(undefined);
  shared.cards.comment.mockResolvedValue(COMMENT_ID);
  shared.cards.attach.mockResolvedValue(FILE_ID);
  shared.calendar.range.mockResolvedValue([cardSummaryFixture]);

  shared.runCrmOp.mockResolvedValue({ ok: true, count: 5 });
  shared.runCrmAction.mockResolvedValue({ ok: true });

  shared.bookList.mockResolvedValue([bookRowFixture]);
  shared.remindMany.mockResolvedValue({ sent: 1, skipped: 0 });

  shared.supportList.mockResolvedValue([ticketFixture]);
  shared.supportCounts.mockResolvedValue({ new: 1, in_progress: 0, waiting: 0, done: 0, rejected: 0 });
  shared.supportByNumber.mockResolvedValue(ticketFixture);
  shared.supportUpdate.mockResolvedValue({ ok: true, notified: true });
  shared.supportNotify.mockResolvedValue({ ok: true, notified: true });

  shared.allStaff.mockResolvedValue([
    { id: OWNER.id, name: OWNER.name, email: OWNER.email, disabled: false },
    { id: MANAGER.id, name: MANAGER.name, email: MANAGER.email, disabled: false },
  ]);
  shared.getSetting.mockImplementation(async (k: string) => settings[k] ?? "");
  shared.listFields.mockResolvedValue([]);
  shared.salesRegister.mockResolvedValue([
    {
      id: DEAL_ID,
      number: 12,
      createdAt: new Date("2026-11-10T09:00:00Z"),
      soldAt: new Date("2026-11-11T09:00:00Z"),
      source: "whatsapp",
      utm: null,
      assigneeId: OWNER.id,
      client: "Алия",
      phone: "+77001234567",
      plan: "hardcover",
      recipient: "Папа",
      eventDate: "2026-12-25",
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
  shared.setPayForm.mockResolvedValue({ ok: true });
  shared.loadSalesAnalytics.mockResolvedValue(salesAnalyticsFixture());
  shared.leadStats.mockResolvedValue({
    deals: [],
    payments: [],
    invoices: [],
    spend: [],
  });
  shared.mergeClosedDays.mockResolvedValue(30);
  shared.saveCrmSettings.mockResolvedValue({ ok: "Сохранено" });
  shared.saveBot.mockResolvedValue({ ok: "Сохранено" });

  shared.rolesWithMembers.mockResolvedValue(roleRowsFixture);
  shared.saveRole.mockResolvedValue({ ok: "Роль сохранена" });
  shared.deleteRole.mockResolvedValue(undefined);
  shared.twoFactorStatus.mockResolvedValue([
    { id: OWNER.id, name: OWNER.name, email: OWNER.email, totpEnabledAt: OWNER.totpEnabledAt, staffDisabled: false },
    { id: MANAGER.id, name: MANAGER.name, email: MANAGER.email, totpEnabledAt: MANAGER.totpEnabledAt, staffDisabled: false },
  ]);
  shared.beginTwoFactor.mockResolvedValue({
    secret: "JBSWY3DPEHPK3PXP",
    otpauthUrl: "otpauth://totp/MyBooks:owner@mybooks.kz?secret=JBSWY3DPEHPK3PXP&issuer=MyBooks",
  });
  shared.confirmTwoFactor.mockResolvedValue({ ok: true, codes: ["1111-AAAA"] });
  shared.newBackupCodes.mockResolvedValue({ ok: true, codes: ["2222-BBBB"] });
  shared.disableTwoFactor.mockResolvedValue({ ok: true });
  shared.saveSecurity.mockResolvedValue({ ok: "Сохранено" });
  shared.resetStaffTwoFactor.mockResolvedValue({ ok: true });
});

describe("ответы Nest байт в байт (эталон — прежний mybook-api) (Контекст 5A-1 — все 45 маршрутов)", () => {
  it("доски задач (19 маршрутов) + BoardsError совпадают байт в байт", async () => {
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/boards", headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/boards/${BOARD_ID}?done=1`, headers: asOwner });
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/cards", headers: asOwner, body: { title: "Задача", boardId: BOARD_ID } });
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/cards/${CARD_ID}`, headers: asOwner });
    await assertRoute({ nest: app, method: "PATCH", url: `/api/v1/cards/${CARD_ID}`, headers: asOwner, body: { title: "Новая" } });
    await assertRoute({ nest: app, method: "DELETE", url: `/api/v1/cards/${CARD_ID}`, headers: asOwner });
    await assertRoute({ nest: app, method: "POST", url: `/api/v1/cards/${CARD_ID}/move`, headers: asOwner, body: { columnId: COL_ID } });
    await assertRoute({ nest: app, method: "POST", url: `/api/v1/cards/${CARD_ID}/done`, headers: asOwner, body: { done: true, result: "ОК" } });
    await assertRoute({ nest: app, method: "POST", url: `/api/v1/cards/${CARD_ID}/archive`, headers: asOwner, body: { archived: true } });
    await assertRoute({ nest: app, method: "PUT", url: `/api/v1/cards/${CARD_ID}/assignees`, headers: asOwner, body: { userIds: [OWNER.id] } });
    await assertRoute({ nest: app, method: "PUT", url: `/api/v1/cards/${CARD_ID}/watch`, headers: asOwner, body: { on: false } });
    await assertRoute({ nest: app, method: "PUT", url: `/api/v1/cards/${CARD_ID}/labels/${LABEL_ID}`, headers: asOwner, body: { on: true } });
    await assertRoute({ nest: app, method: "POST", url: `/api/v1/cards/${CARD_ID}/checklists`, headers: asOwner, body: { title: "Чек", items: ["1"] } });
    await assertRoute({ nest: app, method: "POST", url: `/api/v1/checklists/${CHECKLIST_ID}/items`, headers: asOwner, body: { text: "Пункт" } });
    await assertRoute({ nest: app, method: "PATCH", url: `/api/v1/checklist-items/${ITEM_ID}`, headers: asOwner, body: { done: true } });
    await assertRoute({ nest: app, method: "DELETE", url: `/api/v1/checklist-items/${ITEM_ID}`, headers: asOwner });
    await assertRoute({ nest: app, method: "POST", url: `/api/v1/cards/${CARD_ID}/comments`, headers: asOwner, body: { text: "Привет" } });

    const mp = makeMultipart("file", "a.txt", "text/plain", "hello");
    await assertRoute({
      nest: app,
      method: "POST",
      url: `/api/v1/cards/${CARD_ID}/files`,
      headers: { ...asOwner, "content-type": mp.contentType },
      body: mp.body,
    });

    await assertRoute({
      nest: app,
      method: "GET",
      url: `/api/v1/tasks/calendar?from=2026-11-01T00:00:00Z&to=2026-11-30T23:59:59Z&boardId=${BOARD_ID}&mine=1`,
      headers: asOwner,
    });

    shared.cards.detail.mockRejectedValue(new BoardsError("forbidden", "Нет доступа к карточке"));
    await assertRoute({ nest: app, method: "GET", url: `/api/v1/cards/${CARD_ID}`, headers: asOwner });
  });

  it("веб-CRM (3 маршрута), включая redirect, notFound и не-сотрудника, совпадают байт в байт", async () => {
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/web/crm/staff", headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/web/crm/staff", headers: asRegular });

    const args = await encodeWire({ q: "test" });
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/web/crm/read/shell.layout", headers: asOwner, body: { args } });
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/web/crm/act/deals.move", headers: asOwner, body: { args: [] } });

    shared.runCrmAction.mockRejectedValue(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/admin/orders;307;" }));
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/web/crm/act/orders.go", headers: asOwner, body: { args: [] } });

    shared.runCrmAction.mockRejectedValue(Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_NOT_FOUND" }));
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/web/crm/act/orders.miss", headers: asOwner, body: { args: [] } });
  });

  it("книги (2) и поддержка (4) совпадают байт в байт на 200, 400 refused, 403 и 404", async () => {
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/crm/books?f=all&theme=dad", headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/crm/books", headers: asManager });
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/crm/books/remind", headers: asOwner, body: { clientIds: [CLIENT_ID] } });

    await assertRoute({ nest: app, method: "GET", url: "/api/v1/crm/support?status=open", headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/crm/support/55", headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/crm/support/55", headers: asManager });
    await assertRoute({
      nest: app,
      method: "PATCH",
      url: "/api/v1/crm/support/55",
      headers: asOwner,
      body: { status: "done", resolution: "Ок", devNote: "ok", notify: true },
    });
    await assertRoute({
      nest: app,
      method: "PATCH",
      url: "/api/v1/crm/support/55",
      headers: asOwner,
      body: { status: "invalid", resolution: "", devNote: "", notify: false },
    });
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/crm/support/55/notify", headers: asOwner });

    shared.supportByNumber.mockResolvedValue(null);
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/crm/support/999", headers: asOwner });
  });

  it("аналитика (4) и настройки (3) совпадают байт в байт", async () => {
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/crm/sales?p=custom&from=2026-11-01&to=2026-11-26", headers: asOwner });
    await assertRoute({ nest: app, method: "PUT", url: `/api/v1/crm/sales/${DEAL_ID}/pay-form`, headers: asOwner, body: { form: "Kaspi Gold" } });
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/crm/analytics?p=custom&from=2026-11-01&to=2026-11-26", headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/crm/leads?p=custom&from=2026-11-01&to=2026-11-26", headers: asOwner });

    await assertRoute({ nest: app, method: "GET", url: "/api/v1/crm/settings/sales", headers: asOwner });
    await assertRoute({
      nest: app,
      method: "PUT",
      url: "/api/v1/crm/settings/sales",
      headers: asOwner,
      body: {
        workDays: [1, 2, 3, 4, 5],
        from: "09:00",
        to: "18:00",
        off: "16.12.2026",
        slaMinutes: 15,
        reassignMinutes: 15,
        autoDealFrom: "book_started",
        mergeClosedDays: 30,
        maxDiscount: 10,
        unsorted: true,
        digest: true,
        autoLetters: true,
        chatReward: false,
        widgetEnabled: true,
        widgetChat: true,
        widgetHelp: true,
      },
    });
    await assertRoute({ nest: app, method: "PUT", url: "/api/v1/crm/settings/bot-mode", headers: asOwner, body: { mode: "fallback" } });
  });

  it("роли и 2FA (10 маршрутов) + ошибки 400/401/403/405 совпадают байт в байт", async () => {
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/crm/roles", headers: asOwner });
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/crm/roles", headers: asOwner, body: { name: "Аналитик", scope: "all", permissions: ["analytics.view"] } });
    await assertRoute({ nest: app, method: "DELETE", url: `/api/v1/crm/roles/${ROLE_ID}`, headers: asOwner });

    await assertRoute({ nest: app, method: "GET", url: "/api/v1/crm/security", headers: asOwner });
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/crm/security", headers: asManager });
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/crm/security/2fa/start", headers: asOwner });
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/crm/security/2fa/confirm", headers: asOwner, body: { code: "123456" } });
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/crm/security/2fa/backup", headers: asOwner, body: { code: "123456" } });
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/crm/security/2fa/disable", headers: asOwner, body: { code: "123456" } });
    await assertRoute({ nest: app, method: "PATCH", url: "/api/v1/crm/security/rules", headers: asOwner, body: { require2fa: true, ipAllowlist: "198.51.100.0/24" } });
    await assertRoute({ nest: app, method: "POST", url: `/api/v1/crm/security/staff/${MANAGER.id}/reset-2fa`, headers: asOwner });

    // Refused из доменных ошибок
    shared.deleteRole.mockRejectedValue(new AccessError("systemRole", "Системную роль удалить нельзя"));
    await assertRoute({ nest: app, method: "DELETE", url: `/api/v1/crm/roles/${ROLE_ID}`, headers: asOwner });

    shared.beginTwoFactor.mockRejectedValue(new IdentityError("twoFactorAlreadyOn"));
    await assertRoute({ nest: app, method: "POST", url: "/api/v1/crm/security/2fa/start", headers: asOwner });

    // 401, 403, 400, 405
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/crm/roles" });
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/crm/roles", headers: asRegular });
    await assertRoute({ nest: app, method: "GET", url: "/api/v1/crm/roles", headers: asManager });
    await assertRoute({ nest: app, method: "DELETE", url: "/api/v1/crm/roles/not-a-uuid", headers: asManager });
    await assertRoute({ nest: app, method: "DELETE", url: "/api/v1/crm/security", headers: asOwner });
  });
});
