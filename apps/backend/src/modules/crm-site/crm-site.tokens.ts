import type { Locale } from "@/i18n/config";
import type { ChatFilter } from "@/lib/crm/inbox-model";
import type { AccessModule } from "@/modules/access";
import type { StaffContext } from "@/modules/access/domain/StaffContext";
import type { BoardViewer } from "@/modules/boards";
import type { Attachment, BotMaterial, ChatMessage, Conversation, MaterialLang, SensitiveFinding } from "@/modules/messaging";
import type { PrintFileKind, PrintJob } from "@/modules/production";
import type { LiveState, OrderFilters, ReportingModule, Viewer } from "@/modules/reporting";
import type { Actor, NewTicketInput, Ticket, UploadedFile } from "@/modules/support";
import type { LiveEvent, SettingKey } from "@/modules/workspace";
import type { SupportAttachment } from "@/shared/domain/support";
import type { StaffMember } from "../../core/auth/staff";

/** Контекст текущего запроса сотрудника для переходного слоя legacy (без `next/headers`). */
export interface CrmSiteRequestContext {
  staff: StaffMember;
  token: string | null;
  ip: string;
  locale: Locale;
}

/** Заголовки и сигнал отмены для потоковой выдачи файла из хранилища (Range / If-None-Match / abort). */
export interface StorageStreamInput {
  range: string | null;
  ifNoneMatch: string | null;
  signal: AbortSignal;
}

/** Результат отправки загруженного файла в чат. */
export interface SentChatUpload {
  id: string;
  status: string;
  error?: string | null;
}

/** Потоковый файл вложения WhatsApp (из шлюза GOWA или хранилища сайта). */
export interface ChatMediaStream {
  body: ReadableStream<Uint8Array>;
  contentType: string | null;
  size?: string | null;
  range?: string | null;
}

/** Вложение карточки доски задач. */
export interface BoardCardAttachment {
  storageKey: string;
  name: string;
  mime: string;
}

/** Минимальные данные заказа для сборки ZIP-пакета типографии. */
export interface OrderPackageInfo {
  id: string;
  bookId: string;
  number: number;
  plan: string;
  quantity: number;
}

/** Вход релиза для закрытия обращений по коммитам. */
export interface SupportReleaseInput {
  release: string;
  commits: Array<{ sha: string; subject: string; body?: string }>;
}

/** Минимальные данные сделки для проверки видимости вложения чата. */
export interface DealAssigneeRef {
  assigneeId: string | null;
}

/** Байты и MIME изображения товара каталога WhatsApp. */
export interface CatalogImageData {
  data: Uint8Array;
  mime: string;
}

/** Запись сотрудника для выгрузок и маппинга имён. */
export type StaffDirectoryEntry = Awaited<ReturnType<AccessModule["queries"]["allStaff"]>>[number];
export type ClientsExportResult = Awaited<ReturnType<ReportingModule["clients"]>>;
export type ClientsExportInput = Parameters<ReportingModule["clients"]>[0];
export type ExpensesExportRows = Awaited<ReturnType<ReportingModule["expenses"]>>;
export type FinanceExportData = Awaited<ReturnType<ReportingModule["finance"]>>;
export type LeadStatsExportData = Awaited<ReturnType<ReportingModule["leadStats"]>>;
export type OrderExportRows = Awaited<ReturnType<ReportingModule["orderExport"]>>;
export type PaymentsExportRows = Awaited<ReturnType<ReportingModule["paymentsExport"]>>;
export type ProfitExportData = Awaited<ReturnType<ReportingModule["profit"]>>;
export type SalesRegisterRows = Awaited<ReturnType<ReportingModule["salesRegister"]>>;
export type VcardExportRows = Awaited<ReturnType<ReportingModule["vcardClients"]>>;

/**
 * Единый порт для 28 не-денежных маршрутов сайта CRM (Контекст 5B):
 * чаты и материалы бота (7), доски/вложения задач/поддержка (5), каталог (2),
 * live/SSE/уведомления/push/упаковка (5) и 9 выгрузок CSV/vCard.
 */
export interface CrmSitePorts {
  // ─── Чаты и материалы бота ──────────────────────────────────────────────
  chatsInbox(ctx: CrmSiteRequestContext, input: { f: ChatFilter; q?: string }): Promise<unknown>;
  findConversation(id: string): Promise<Conversation | null>;
  chatMessages(conversationId: string, limit: number, before?: Date): Promise<ChatMessage[]>;
  sensitiveFor(conv: Conversation, text: string): Promise<SensitiveFinding[]>;
  sendChatUpload(
    conversationId: string,
    file: { data: Uint8Array; name: string; mime: string },
    caption: string,
    authorId: string,
    opts: { replyToId?: string | null },
  ): Promise<SentChatUpload>;
  convertAudio(data: Uint8Array, to: "ogg"): Promise<{ data: Uint8Array; mime: string } | null>;
  findMessageMedia(messageId: string): Promise<Attachment | null>;
  findDealById(dealId: string): Promise<DealAssigneeRef | null>;
  openMessageMedia(attachment: Attachment, range: string | null): Promise<ChatMediaStream | null>;
  addBotMaterial(
    file: { data: Uint8Array; name: string; mime: string },
    meta: { caption: string; lang: MaterialLang; about: string },
    actorId: string,
  ): Promise<BotMaterial>;
  botMaterialFile(id: string): Promise<{ data: Uint8Array; material: BotMaterial } | null>;

  // ─── Доски, вложения задач и поддержка ──────────────────────────────────
  boardsDispatch(ctx: CrmSiteRequestContext, req: Request, path: string[]): Promise<Response>;
  boardCardFile(viewer: BoardViewer, cardId: string, attachmentId: string): Promise<BoardCardAttachment>;
  serveBoardFile(
    storageKey: string,
    mime: string,
    req: StorageStreamInput,
    headers: Record<string, string>,
  ): Promise<Response | null>;
  createSupportTicket(
    input: NewTicketInput,
    uploads: UploadedFile[],
    actor: Actor,
    opts: { chatMessages: number },
  ): Promise<Pick<Ticket, "id" | "number" | "notifyPhone">>;
  linkSupportChat(ticketId: string, conversationId: string, messageIds: string[], actor: Actor): Promise<void>;
  processSupportTicket(ticketId: string): Promise<void>;
  scheduleBackground(fn: () => unknown): void;
  findSupportTicket(ticketId: string): Promise<Pick<Ticket, "id" | "createdBy"> | null>;
  findSupportAttachment(ticketId: string, attachmentId: string): Promise<SupportAttachment | null>;
  serveSupportAttachment(
    attachment: SupportAttachment,
    req: StorageStreamInput,
    headers: Record<string, string>,
  ): Promise<Response | null>;
  isReleaseTokenValid(token: string | null): boolean;
  markSupportReleased(input: SupportReleaseInput): Promise<unknown>;

  // ─── Каталог WhatsApp ───────────────────────────────────────────────────
  catalogRemoteImage(url: string): Promise<CatalogImageData | null>;
  catalogProductImage(id: string): Promise<CatalogImageData | null>;

  // ─── Live/SSE, уведомления, push и упаковка заказа ──────────────────────
  liveState(context: StaffContext): Promise<LiveState>;
  subscribeLive(onEvent: (event: LiveEvent) => void): Promise<() => void>;
  markNotificationsRead(userId: string, id?: string): Promise<void>;
  syncMobileBadge(userId: string): Promise<void>;
  vapidKeys(): Promise<{ publicKey: string }>;
  subscribePush(userId: string, input: { endpoint: string; p256dh: string; auth: string; userAgent: string }): Promise<void>;
  unsubscribePush(userId: string, endpoint: string): Promise<void>;
  findOrderDetails(orderId: string): Promise<OrderPackageInfo | null>;
  canSeeOrder(staff: StaffMember, orderId: string): Promise<boolean>;
  preparePrintFiles(job: PrintJob): Promise<void>;
  getPrintFile(job: PrintJob, kind: Exclude<PrintFileKind, "reading">): Promise<Buffer>;

  // ─── Экспорты и аудит ───────────────────────────────────────────────────
  audit(
    staff: StaffMember,
    action: string,
    entity: string,
    entityId?: string | null,
    details?: Record<string, unknown>,
  ): Promise<void>;
  allStaff(): Promise<StaffDirectoryEntry[]>;
  getSetting(key: SettingKey): Promise<string | null>;
  exportClients(input: ClientsExportInput): Promise<ClientsExportResult>;
  exportExpenses(first: string, last: string): Promise<ExpensesExportRows>;
  exportFinance(range: { from: Date; to: Date }): Promise<FinanceExportData>;
  exportLeadStats(range: { from: Date; to: Date; first: string; last: string }): Promise<LeadStatsExportData>;
  exportOrders(filters: OrderFilters, viewer: Viewer): Promise<OrderExportRows>;
  exportPayments(days: number, viewer: Viewer): Promise<PaymentsExportRows>;
  exportProfit(range: {
    from: Date;
    to: Date;
    first: string;
    last: string;
    prev: { from: Date; to: Date; first: string; last: string };
  }): Promise<ProfitExportData>;
  exportSalesRegister(range: { from: Date; to: Date }): Promise<SalesRegisterRows>;
  exportVcard(input: { since: Date | null; scopeManagerId: string | null }): Promise<VcardExportRows>;
}

export const CRM_SITE_PORTS = Symbol("crmSitePorts");
