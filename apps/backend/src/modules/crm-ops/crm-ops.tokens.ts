import type { FastifyRequest } from "fastify";
import type { z } from "zod";
import type { Locale } from "@/i18n/config";
import type { CardSummary as CardSummaryOut } from "@mybook/contracts";
import type { StaffGate } from "@/modules/access";
import type { BoardSummary, BoardView, BoardViewer, CardCreateInput, CardDetail, CardSummary, CardUpdateInput } from "@/modules/boards";
import type { CurrentUser } from "@/modules/identity";
import type { BotMode } from "@/modules/messaging/domain/bot";
import type { BotConfig } from "@/modules/messaging/domain/botConfig";
import type { Viewer } from "@/modules/reporting";
import type { FinancePeriod } from "@/modules/reporting/ui/finance-screen";
import type { LeadDealRow, LeadPaymentRow, RegisterRow } from "@/modules/reporting/ui/lead-stats";
import type { ResponseGroup, ResponseStats } from "@/modules/reporting/ui/response-stats";
import type { Ticket, TicketFilter } from "@/modules/support";
import type { Permission, RoleScope } from "@/shared/domain/permissions";
import type { SupportStatus } from "@/shared/domain/support";
import type { CrmField } from "@/shared/infrastructure/db/schema";
import type { StaffMember } from "../../core/auth/staff";
import type { AppConfig } from "../../core/config/app-config";
import { clientIp } from "../../core/http/client-ip";

/** Контекст текущего запроса NestJS для вызовов переходного слоя без `next/headers`. */
export interface CrmOpsCallContext {
  token: string | null;
  user: CurrentUser | null;
  staff: StaffMember | null;
  gate: StaffGate;
  ip: string;
  locale: Locale;
}

/** Строка сотрудника из выборки `access.queries.allStaff()`. */
export interface StaffListRow {
  id: string;
  name: string;
  email: string;
  disabled: boolean;
}

/** Строка списка книг клиентов из `reporting.bookList`. */
export interface CrmBookListRow {
  book: {
    id: string;
    title: string | null;
    theme: string;
    authorName: string;
    recipientName: string;
    status: string;
    occasion: string | null;
    occasionDate: string | null;
    updatedAt: Date;
  };
  owner: {
    id: string;
    email: string;
    name: string;
    remindedAt: Date | null;
  };
  answered: number;
  total: number;
  words: number;
  photos: number;
  hasOrder: boolean;
  deal: { id: string; number: number } | null;
}

/** Счётчики обращений поддержки по статусам. */
export type SupportCounts = Record<SupportStatus, number>;

/** Ключи настроек, читаемые контроллерами Контекста 5A-1. */
export type CrmOpsSettingKey =
  | "finance.fees"
  | "crm.slaMinutes"
  | "crm.workHours"
  | "crm.autoDealFrom"
  | "crm.unsorted"
  | "crm.maxDiscount"
  | "widget.enabled"
  | "widget.chat"
  | "crm.reassignMinutes"
  | "crm.digest"
  | "referral.chatReward"
  | "widget.help"
  | "notify.auto"
  | "bot.mode"
  | "bot.config"
  | "security.require2fa"
  | "security.ipAllowlist";

/** Результат действий `updateTicketAction` / `notifyTicketAction`. */
export type SupportActionResult = { ok: true; notified: boolean | null } | { ok: false; error: string };

/** Результат простого действия формы (`saveCrmSettingsAction`, `saveBotAction`, `saveRoleAction`, `saveSecurityAction`). */
export interface FormActionState {
  error?: string;
  ok?: string;
}

/** Результат действий 2FA с резервными кодами (`confirmTwoFactorAction`, `newBackupCodesAction`). */
export type TwoFactorCodesResult = { ok: true; codes: string[] } | { ok: false; message: string };

/** Результат действий 2FA без полезной нагрузки (`disableTwoFactorAction`, `resetStaffTwoFactorAction`). */
export type TwoFactorActionResult = { ok: true } | { ok: false; message: string };

/** Строка данных статистики лидов из `reporting.leadStats`. */
export interface LeadStatsData {
  deals: LeadDealRow[];
  payments: LeadPaymentRow[];
  invoices: { at: Date; assigneeId: string | null }[];
  spend: { day: string; amount: number }[];
}

/** Строка аналитики продаж из `loadSalesAnalytics`. */
export interface SalesAnalyticsData {
  pipelines: { id: string; name: string }[];
  pipeline: { id: string; name: string };
  period: FinancePeriod;
  showProfit: boolean;
  flow: {
    incoming: number;
    refunds: number;
    fees: number;
    tax: number;
    net: number;
    other: number;
    profit: number;
    revenue: number;
    prevRevenue: number;
  };
  resp: ResponseStats;
  sla: number;
  shift: number;
  workMins: (m: number | null) => string;
  share: (x: number | null) => string;
  t: Record<string, unknown>;
  p: Record<string, unknown>;
  channelRows: { key: string; label: string; created: number; won: number; revenue: number }[];
  c: Record<string, unknown>;
  team: (Record<string, unknown> & { name: string; resp: ResponseGroup | undefined })[];
  inWork: number;
  planPct: (id: string) => string;
  base: number;
  funnel: {
    st: { id: string; name: string; kind: string };
    n: number;
    prevN: number | null;
    time: { avg_sec: unknown } | undefined;
  }[];
  lost: { rows: Record<string, unknown>[] };
  awaiting: { rows: Record<string, unknown>[] };
}

/** Строка роли с количеством участников из `access.queries.rolesWithMembers()`. */
export interface RoleWithMembersRow {
  role: {
    id: string;
    name: string;
    scope: RoleScope;
    permissions: string[];
    key: string | null;
  };
  members: number;
}

/** Строка статуса 2FA сотрудника из `access.queries.twoFactorStatus()`. */
export interface TwoFactorTeamRow {
  id: string;
  name: string;
  email: string;
  totpEnabledAt: Date | null;
  staffDisabled: boolean;
}

/** Вложение карточки доски для `cards.attach`. */
export interface CardAttachmentUpload {
  name: string;
  type: string;
  data: Uint8Array;
}

/**
 * Порты Контекста 5A-1 («CRM-2, часть 1»): доски задач, веб-CRM (read/act), книги, поддержка,
 * отчёты/аналитика, настройки отдела продаж/бота, роли и 2FA.
 */
export interface CrmOpsPorts {
  // ─── Доски задач (19 маршрутов) ──────────────────────────────────────────────────────────────────────────────
  listBoards(viewer: BoardViewer): Promise<BoardSummary[]>;
  viewBoard(viewer: BoardViewer, boardId: string, opts: { done: boolean }): Promise<BoardView>;
  createCard(viewer: BoardViewer, input: CardCreateInput): Promise<string>;
  cardSummary(viewer: BoardViewer, cardId: string): Promise<CardSummary>;
  cardDetail(viewer: BoardViewer, cardId: string): Promise<CardDetail>;
  updateCard(viewer: BoardViewer, cardId: string, patch: CardUpdateInput): Promise<void>;
  removeCard(viewer: BoardViewer, cardId: string): Promise<void>;
  moveCard(viewer: BoardViewer, cardId: string, input: { boardId?: string | null; columnId: string; beforeId?: string | null; afterId?: string | null }): Promise<void>;
  setCardDone(viewer: BoardViewer, cardId: string, done: boolean, result?: string | null): Promise<void>;
  archiveCard(viewer: BoardViewer, cardId: string, archived: boolean): Promise<void>;
  setCardAssignees(viewer: BoardViewer, cardId: string, userIds: string[]): Promise<void>;
  setCardWatching(viewer: BoardViewer, cardId: string, userId: string, on: boolean): Promise<void>;
  setCardLabel(viewer: BoardViewer, cardId: string, labelId: string, on: boolean): Promise<void>;
  addChecklist(viewer: BoardViewer, cardId: string, title: string, items: string[]): Promise<string>;
  addChecklistItem(viewer: BoardViewer, checklistId: string, text: string): Promise<string>;
  updateChecklistItem(viewer: BoardViewer, itemId: string, patch: { text?: string; done?: boolean; assigneeId?: string | null; dueAt?: string | null }): Promise<void>;
  deleteChecklistItem(viewer: BoardViewer, itemId: string): Promise<void>;
  commentCard(viewer: BoardViewer, cardId: string, text: string): Promise<string>;
  attachCardFile(viewer: BoardViewer, cardId: string, file: CardAttachmentUpload): Promise<string>;
  calendarRange(viewer: BoardViewer, from: Date, to: Date, opts: { boardId: string | null; mine: boolean }): Promise<CardSummary[]>;

  // ─── Веб-CRM (read/act) ──────────────────────────────────────────────────────────────────────────────────────
  runCrmOp(call: CrmOpsCallContext, op: string, args: unknown): Promise<unknown>;
  runCrmAction(call: CrmOpsCallContext, op: string, args: unknown): Promise<unknown>;

  // ─── Книги CRM ───────────────────────────────────────────────────────────────────────────────────────────────
  bookList(filter: "all" | "writing" | "stalled" | "ready" | "ordered", opts: { q?: string; theme?: string; staleDays: number; now: number; viewer: Viewer }): Promise<CrmBookListRow[]>;
  remindMany(call: CrmOpsCallContext, clientIds: string[]): Promise<{ sent: number; skipped: number }>;

  // ─── Поддержка (обращения) ───────────────────────────────────────────────────────────────────────────────────
  supportList(filter: TicketFilter): Promise<Ticket[]>;
  supportCounts(createdBy?: string): Promise<SupportCounts>;
  supportTicketByNumber(number: number): Promise<Ticket | null>;
  supportUpdate(call: CrmOpsCallContext, number: number, input: { id: string; status: SupportStatus; resolution: string; devNote: string; notify: boolean }): Promise<SupportActionResult>;
  supportNotify(call: CrmOpsCallContext, number: number, id: string): Promise<SupportActionResult>;

  // ─── Отчёты, аналитика и настройки ───────────────────────────────────────────────────────────────────────────
  allStaff(): Promise<StaffListRow[]>;
  getSetting(key: CrmOpsSettingKey): Promise<string>;
  listFields(entity: "deal" | "client"): Promise<CrmField[]>;
  salesRegister(range: { from: Date; to: Date }): Promise<RegisterRow[]>;
  setPayForm(call: CrmOpsCallContext, dealId: string, form: string): Promise<{ ok: true } | { ok: false; error: string }>;
  loadSalesAnalytics(call: CrmOpsCallContext, staff: StaffMember, query: { p?: string; from?: string; to?: string; pl?: string }): Promise<SalesAnalyticsData>;
  leadStats(range: { from: Date; to: Date; first: string; last: string }): Promise<LeadStatsData>;
  mergeClosedDays(): Promise<number>;
  saveCrmSettings(call: CrmOpsCallContext, form: FormData): Promise<FormActionState>;
  saveBot(call: CrmOpsCallContext, input: BotConfig & { mode: BotMode }): Promise<FormActionState>;

  // ─── Роли и безопасность (2FA) ───────────────────────────────────────────────────────────────────────────────
  rolesWithMembers(): Promise<RoleWithMembersRow[]>;
  saveRole(call: CrmOpsCallContext, form: FormData): Promise<FormActionState>;
  deleteRole(call: CrmOpsCallContext, roleId: string): Promise<void>;
  twoFactorStatus(): Promise<TwoFactorTeamRow[]>;
  beginTwoFactor(userId: string): Promise<{ secret: string; otpauthUrl: string }>;
  confirmTwoFactor(call: CrmOpsCallContext, code: string): Promise<TwoFactorCodesResult>;
  newBackupCodes(call: CrmOpsCallContext, code: string): Promise<TwoFactorCodesResult>;
  disableTwoFactor(call: CrmOpsCallContext, code: string): Promise<TwoFactorActionResult>;
  saveSecurity(call: CrmOpsCallContext, form: FormData): Promise<FormActionState>;
  resetStaffTwoFactor(call: CrmOpsCallContext, userId: string): Promise<TwoFactorActionResult>;
}

export const CRM_OPS_PORTS = Symbol("CrmOpsPorts");

/** Отказ действия CRM — 400 с кодом `refused` и текстом для сотрудника (паритет с apps/api/src/routes/crm/common.ts). */
export const refused = (message: string): Response =>
  Response.json({ error: message, code: "refused" }, { status: 400, headers: { "cache-control": "no-store" } });

/** Собирает контекст запроса NestJS для передачи в переходный слой `runInLegacyRequest`. */
export function crmOpsCall(
  req: FastifyRequest,
  config: AppConfig,
  opts: { staff?: StaffMember | null; user?: CurrentUser | null; token: string | null; locale: Locale },
): CrmOpsCallContext {
  const staff = opts.staff ?? null;
  return {
    token: opts.token,
    user: opts.user ?? staff?.user ?? null,
    staff,
    gate: staff?.gate ?? null,
    ip: clientIp(req, config.edgeIpSecret),
    locale: opts.locale,
  };
}

/** Приводит проверенного сотрудника CRM к зрителю модуля досок (`BoardViewer`). */
export function boardViewerOf(staff: StaffMember): BoardViewer {
  return {
    userId: staff.user.id,
    name: staff.user.name || staff.user.email,
    seesAll: staff.scope === "all",
    allTasks: staff.context.can("tasks.all"),
    manageBoards: staff.context.can("boards.manage"),
  };
}

/** Приводит карточку доски к DTO контракта `CardSummary`. */
export const toCard = (s: CardSummary): z.output<typeof CardSummaryOut> => ({
  id: s.id,
  title: s.title,
  kind: s.kind,
  boardId: s.boardId,
  columnId: s.columnId,
  position: s.position,
  priority: s.priority,
  startAt: s.startAt,
  dueAt: s.dueAt,
  doneAt: s.doneAt,
  archived: s.archived,
  coverColor: s.cover && "color" in s.cover ? s.cover.color : null,
  coverImage: s.cover && "image" in s.cover ? s.cover.image : null,
  assigneeIds: s.assigneeIds,
  watcherIds: s.watcherIds,
  labelIds: s.labelIds,
  checklistDone: s.checklist.done,
  checklistTotal: s.checklist.total,
  comments: s.comments,
  attachments: s.attachments,
  hasDescription: s.hasDescription,
  recurring: s.recurring,
  links: s.links,
  editable: s.editable,
});

/** Приводит колонку доски к DTO контракта `BoardColumn`. */
export const columnOut = (x: { id: string; name: string; done: boolean; wipLimit?: number | null }) => ({
  id: x.id,
  name: x.name,
  done: x.done,
  wipLimit: x.wipLimit ?? null,
});

export type { Permission };
