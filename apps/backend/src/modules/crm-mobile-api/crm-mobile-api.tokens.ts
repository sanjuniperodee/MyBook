import type { Output, Parsed } from "@mybook/contracts";
import type { Locale } from "@/i18n/config";
import type { StaffContext } from "@/modules/access/domain/StaffContext";
import type { StaffMember } from "../../core/auth/staff";

/** Порты Контекста 4B («CRM-1: мобильный API v1 — 44 контрактных маршрута»). */
export const CRM_MOBILE_API_PORTS = Symbol("CrmMobileApiPorts");

/** Контекст текущего запроса сотрудника для переходного слоя legacy (без обращения к next/headers). */
export interface CrmRequestContext {
  staff: StaffMember;
  token: string | null;
  ip: string;
  locale: Locale;
}

export interface CrmLiveMetrics {
  counters: Output<"crmMe">["counters"];
  unread: number;
}

export interface CrmDashboardData {
  cur: { sum: number; n: number };
  prev: { sum: number; n: number };
  newUsers: { cur: number; prev: number };
  daily: { d: string; sum: number; n: number }[];
  funnelRows: { rows: { registered: number; with_book: number; engaged: number; ordered: number; paid: number }[] };
  byPlan: { plan: string; sum: number; n: number }[];
  attention: readonly unknown[];
  deadlines: readonly unknown[];
  dealDeadlines: readonly unknown[];
}

export interface CrmStageCount {
  stageId: string;
  n: number;
}

export interface CrmPipelineStage {
  id: string;
  name: string;
  color: string;
  kind: string;
}

export interface CrmTemplateRow {
  id: string;
  title: string;
  text: string;
  own: boolean;
}

export interface CrmReachTarget {
  dealId?: string;
  orderId?: string;
  clientId?: string;
  callId?: string;
}

export type CrmActionResult = { ok: true; message?: string; id?: string } | { ok: false; message: string };

export type CrmDealActionResult = { ok: true; message?: string } | { ok: false; message: string };

export type CrmTemplateDraftResult =
  | { ok: true; title: string; text: string; replaced: { was: string; with: string }[]; ai: boolean }
  | { ok: false; message: string };

export type CrmChatProductsResult =
  | { ok: true; enabled: boolean; products: Output<"crmChatCatalog">["products"] }
  | { ok: false; error: string };

export type CrmCatalogActionResult = { ok: true; error?: string | null } | { ok: false; error: string };

export type CrmOrderItemsResult =
  | { ok: true; items: Output<"crmChatMessageOrder">["items"]; total: number | null; currency: string }
  | { ok: false; error: string };

export interface CrmForwardResult {
  sent?: number;
  failed?: { title: string; error: string }[];
  error?: string;
}

export type CrmSendMessageResult = { id: string; status: string; error: string | null } | { blocked: string };

export interface CrmVoiceUpload {
  data: Uint8Array;
  name: string;
  mime: string;
}

export interface CrmVoiceSentMessage {
  id: string;
  status: string;
  error?: string | null;
}

export interface CrmMobileApiPorts {
  // Профиль сотрудника, смена, «Обзор»
  autoShiftOnVisit(ctx: CrmRequestContext): Promise<boolean>;
  setShift(ctx: CrmRequestContext, onShift: boolean): Promise<void>;
  live(context: StaffContext): Promise<CrmLiveMetrics>;
  dashboard(staff: StaffMember, period: number): Promise<CrmDashboardData>;
  stageCounts(): Promise<CrmStageCount[]>;
  listStages(): Promise<CrmPipelineStage[]>;

  // Личные шаблоны ответов
  listTemplates(userId: string): Promise<CrmTemplateRow[]>;
  saveMyTemplate(ctx: CrmRequestContext, id: string, title: string, text: string): Promise<{ ok?: true; id?: string; error?: string }>;
  deleteMyTemplate(ctx: CrmRequestContext, id: string): Promise<{ ok?: true; error?: string }>;
  duplicateTemplate(ctx: CrmRequestContext, id: string): Promise<{ ok?: true; error?: string }>;
  reorderMyTemplates(ctx: CrmRequestContext, ids: string[]): Promise<{ ok?: true; error?: string }>;
  aiTemplateDraft(ctx: CrmRequestContext, chatId: string, messageId: string): Promise<CrmTemplateDraftResult>;

  // Звонки
  callDial(ctx: CrmRequestContext, target: CrmReachTarget): Promise<CrmActionResult>;
  markCallHandled(ctx: CrmRequestContext, callId: string): Promise<CrmActionResult>;

  // Каталог WhatsApp в чате и корзина клиента
  chatProducts(ctx: CrmRequestContext): Promise<CrmChatProductsResult>;
  sendProduct(ctx: CrmRequestContext, chatId: string, productId: string): Promise<CrmCatalogActionResult>;
  sendCatalogLink(ctx: CrmRequestContext, chatId: string): Promise<CrmCatalogActionResult>;
  orderItems(ctx: CrmRequestContext, messageId: string): Promise<CrmOrderItemsResult>;

  // Чаты и сообщения
  openChat(ctx: CrmRequestContext, target: CrmReachTarget): Promise<CrmActionResult>;
  forwardTargets(ctx: CrmRequestContext, q: string): Promise<Output<"crmChatForwardTargets">["targets"]>;
  assignConversation(ctx: CrmRequestContext, chatId: string, userId: string | null): Promise<void>;
  createDealFromChat(ctx: CrmRequestContext, chatId: string): Promise<{ id: string }>;
  forwardMessage(ctx: CrmRequestContext, chatId: string, messageId: string, targetIds: string[]): Promise<CrmForwardResult>;
  sendInternalNote(ctx: CrmRequestContext, chatId: string, text: string): Promise<{ id: string }>;
  pinChat(ctx: CrmRequestContext, chatId: string, pinned: boolean): Promise<{ ok?: true; error?: string }>;
  markRead(ctx: CrmRequestContext, chatId: string): Promise<void>;
  setConversationStatus(ctx: CrmRequestContext, chatId: string, status: "open" | "closed"): Promise<void>;
  sendMessage(ctx: CrmRequestContext, chatId: string, text: string, override?: string, replyToId?: string | null): Promise<CrmSendMessageResult>;
  findConversation(chatId: string): Promise<{ id: string; assigneeId: string | null } | null>;
  convertAudio(data: Uint8Array, to: "ogg"): Promise<{ data: Uint8Array; mime: string } | null>;
  sendUpload(conversationId: string, upload: CrmVoiceUpload, caption: string, staffUserId: string, opts: { replyToId: string | null }): Promise<CrmVoiceSentMessage>;
  editMessage(ctx: CrmRequestContext, chatId: string, messageId: string, text: string): Promise<{ ok?: true; error?: string }>;
  deleteMessage(ctx: CrmRequestContext, chatId: string, messageId: string): Promise<{ ok?: true; error?: string }>;
  resendMessage(ctx: CrmRequestContext, chatId: string, messageId: string): Promise<{ ok?: true; error?: string }>;
  transcribeMessage(ctx: CrmRequestContext, chatId: string, messageId: string): Promise<{ text?: string; error?: string }>;

  // Сделки
  createDeal(ctx: CrmRequestContext, form: FormData): Promise<{ error?: string }>;
  acceptDeal(ctx: CrmRequestContext, dealId: string): Promise<CrmDealActionResult>;
  assignDeal(ctx: CrmRequestContext, dealId: string, userId: string | null): Promise<CrmDealActionResult>;
  moveDeal(ctx: CrmRequestContext, dealId: string, stageId: string, lostReason?: string): Promise<CrmDealActionResult>;
  addNote(ctx: CrmRequestContext, form: FormData): Promise<{ error?: string }>;
  rejectDeal(ctx: CrmRequestContext, dealId: string, spam: boolean, reason: string): Promise<{ requested: boolean; message: string; deleted?: boolean }>;

  // Задачи
  createTask(ctx: CrmRequestContext, form: FormData): Promise<{ error?: string }>;
  taskDetail(ctx: CrmRequestContext, taskId: string): Promise<Output<"crmTaskGet"> | null>;
  updateTask(ctx: CrmRequestContext, taskId: string, patch: Parsed<"crmTaskUpdate">["body"]): Promise<{ error?: string }>;
  deleteTask(ctx: CrmRequestContext, taskId: string): Promise<{ error?: string }>;
  completeTask(ctx: CrmRequestContext, taskId: string, body: Parsed<"crmTaskComplete">["body"]): Promise<{ error?: string }>;
  snoozeTask(ctx: CrmRequestContext, taskId: string, by: "hour" | "tomorrow"): Promise<{ error?: string }>;
  toggleTask(ctx: CrmRequestContext, taskId: string): Promise<{ error?: string }>;

  // Заказы (канбан)
  moveOrder(ctx: CrmRequestContext, orderId: string, status: Parsed<"crmOrderStatus">["body"]["status"]): Promise<{ error?: string }>;
}
