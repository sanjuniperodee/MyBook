import type { Output } from "@mybook/contracts";
import type { Locale } from "@/i18n/config";
import type { BotTurnTrace } from "@/modules/messaging/domain/botTrace";
import type { DealView } from "@/modules/sales";
import type { DealLinkInput } from "@/modules/sales/ui/crm-forms";
import type { CrmField, User } from "@/shared/infrastructure/db/schema";
import type { StaffMember } from "../../core/auth/staff";

/** Контекст текущего HTTP-запроса NestJS для проброса в старые действия CRM без `next/headers`. */
export interface CrmRequestMeta {
  staff: StaffMember;
  token: string | null;
  ip: string;
  locale: Locale;
}

export type CrmActionResult = { ok: true; message?: string; id?: string } | { ok: false; message: string };

export interface CrmStaffOptionSource {
  id: string;
  name: string;
  email: string;
  disabled: boolean;
}

export type CrmDealDuplicateItem = DealLinkInput & {
  deal: DealLinkInput["deal"] & { assigneeId: string | null };
};

export type CrmDealReportingRecord = Pick<DealView, "id" | "clientId" | "contactEmail" | "contactPhone" | "extraPhones" | "assigneeId" | "stageId">;

export type CrmClientRecord = Pick<User, "id" | "role" | "managerId" | "name" | "email" | "phone" | "extraPhones" | "tags" | "customFields" | "locale" | "source">;

/** Порт списков CRM (15 маршрутов из crm-lists.ts). */
export interface CrmListsPorts {
  today(staff: StaffMember): Promise<Output<"crmToday">>;
  tasks(staff: StaffMember, opts: { done: boolean; who?: string; kind?: string; q?: string }): Promise<Output<"crmTasksList">["tasks"]>;
  calls(staff: StaffMember, filter: "all" | "missed" | "in" | "out" | "mine", days: number): Promise<Output<"crmCallsList">>;
  clients(staff: StaffMember, opts: { q?: string; sort: "new" | "ltv" | "active"; page: number; mine: boolean }): Promise<Output<"crmClientsList">>;
  clientCard(staff: StaffMember, clientId: string): Promise<Output<"crmClientCard">>;
  staffList(staff: StaffMember): Promise<Output<"crmStaffList">>;
  notifications(userId: string, limit: number): Promise<Output<"crmNotificationsList">["notifications"]>;
  markNotificationsRead(userId: string, id?: string): Promise<void>;
  chats(staff: StaffMember, filter: "open" | "mine" | "unread" | "waiting" | "closed", q?: string): Promise<Output<"crmChatsList">["chats"]>;
  chatDetail(staff: StaffMember, chatId: string, limit: number): Promise<Output<"crmChatGet">>;
  conversation(chatId: string): Promise<{ id: string; assigneeId: string | null; unread: number; status: string } | null>;
  chatMessages(conversationId: string, limit: number, before?: Date): Promise<{ messages: Output<"crmChatMessages">["messages"]; more: boolean }>;
  deals(staff: StaffMember, query: Record<string, string | undefined>): Promise<Output<"crmDealsList">>;
  dealDetail(staff: StaffMember, dealId: string): Promise<Output<"crmDealGet">>;
  orders(staff: StaffMember): Promise<Output<"crmOrdersList">>;
  orderDetail(staff: StaffMember, orderId: string): Promise<Output<"crmOrder">>;
}

/** Порт сделок CRM (10 маршрутов: форма, правка, тариф, подарки и 6 действий «Ещё»). */
export interface CrmDealsPorts {
  findDeal(dealId: string): Promise<DealView | null>;
  dealById(dealId: string): Promise<CrmDealReportingRecord | null>;
  listFields(entity: "deal" | "client"): Promise<CrmField[]>;
  agreedPlan(dealId: string): Promise<string | null>;
  agreedGifts(dealId: string): Promise<readonly string[]>;
  discountLimit(staff: StaffMember): Promise<number | null>;
  updateDeal(meta: CrmRequestMeta, form: FormData): Promise<{ error?: string; ok?: string }>;
  setAgreedPlan(meta: CrmRequestMeta, dealId: string, plan: string | null): Promise<{ ok: boolean; message?: string }>;
  setAgreedGifts(meta: CrmRequestMeta, dealId: string, gifts: string[]): Promise<{ ok: boolean; message?: string }>;
  duplicates(deal: CrmDealReportingRecord): Promise<{ open: CrmDealDuplicateItem[]; past: CrmDealDuplicateItem[] }>;
  findClientByPhone(phone: string): Promise<string | null>;
  clientBrief(clientId: string): Promise<{ name: string | null; email: string | null } | null>;
  listPipelines(): Promise<Array<{ id: string; name: string }>>;
  listStages(): Promise<Array<{ id: string; pipelineId: string }>>;
  createClientFromDeal(meta: CrmRequestMeta, dealId: string, form: FormData): Promise<{ error?: string; done?: { clientId: string; loginText: string; password: string; message: string } }>;
  linkDealClient(meta: CrmRequestMeta, dealId: string, clientId: string | null): Promise<{ ok: boolean; message?: string }>;
  mergeDeal(meta: CrmRequestMeta, targetId: string, sourceId: string): Promise<{ error: string } | void>;
  movePipeline(meta: CrmRequestMeta, dealId: string, pipelineId: string): Promise<void>;
  deleteDeal(meta: CrmRequestMeta, dealId: string): Promise<{ error: string } | void>;
}

/** Порт клиентов CRM и чека сделки (7 маршрутов: карточка, доступ, напоминание, правка, новый клиент, чек). */
export interface CrmClientsPorts {
  clientById(clientId: string): Promise<CrmClientRecord | null>;
  listFields(entity: "client"): Promise<CrmField[]>;
  noMarketingFor(target: { clientId: string; phones: Array<string | null> }): Promise<boolean>;
  allStaff(): Promise<CrmStaffOptionSource[]>;
  listStages(): Promise<Array<{ id: string; name: string; kind: string; pipelineId: string }>>;
  listPipelines(): Promise<Array<{ id: string; name: string }>>;
  discountLimit(staff: StaffMember): Promise<number | null>;
  payFormOptions(): Promise<string[]>;
  issueClientAccess(meta: CrmRequestMeta, clientId: string): Promise<{ error?: string; loginText?: string; password?: string; message?: string }>;
  remindClient(meta: CrmRequestMeta, clientId: string): Promise<{ ok: boolean; message: string }>;
  setClientPhones(meta: CrmRequestMeta, clientId: string, raw: string): Promise<CrmActionResult>;
  updateClientTags(meta: CrmRequestMeta, clientId: string, tags: string[]): Promise<void>;
  setClientFields(meta: CrmRequestMeta, form: FormData): Promise<{ ok?: string; error?: string }>;
  setClientNoMarketing(meta: CrmRequestMeta, clientId: string, on: boolean): Promise<CrmActionResult>;
  setClientLocale(meta: CrmRequestMeta, clientId: string, locale: string): Promise<CrmActionResult>;
  setClientChannel(meta: CrmRequestMeta, clientId: string, channel: string): Promise<CrmActionResult>;
  setClientManager(meta: CrmRequestMeta, clientId: string, managerId: string | null): Promise<CrmActionResult>;
  createClient(meta: CrmRequestMeta, form: FormData): Promise<{ error?: string; done?: Output<"crmClientCreate"> }>;
  uploadDealReceipt(
    meta: CrmRequestMeta,
    input: { url: string; dealId: string; amount: string; paymentId?: string; file?: File },
  ): Promise<{ ok: true } | { ok: false; response: Response }>;
}

export type CrmOfferSendRequest = { kind: "order" } | { kind: "book" } | { kind: "discount"; percent: number; hours: number };

/** Порт чатов CRM: бот («Почему так?», запуск/остановка) и КП (5 маршрутов). */
export interface CrmChatsPorts {
  conversation(chatId: string): Promise<{ id: string; assigneeId: string | null; clientId: string | null } | null>;
  botTrace(meta: CrmRequestMeta, chatId: string, messageId: string): Promise<{ trace?: BotTurnTrace; error?: string }>;
  botTraces(chatId: string, limit: number): Promise<Array<{ id: string; at: Date; messageId: string | null; trace: BotTurnTrace }>>;
  startBot(meta: CrmRequestMeta, chatId: string): Promise<void>;
  stopBot(meta: CrmRequestMeta, chatId: string): Promise<void>;
  chatOffers(clientId: string | null, canPromo: boolean): Promise<{ order: { number: number } | null; book: { title: string } | null; maxDiscount: number }>;
  sendOffer(meta: CrmRequestMeta, chatId: string, request: CrmOfferSendRequest): Promise<{ ok: boolean; message: string }>;
}

export const CRM_LISTS_PORTS = Symbol("CrmListsPorts");
export const CRM_DEALS_PORTS = Symbol("CrmDealsPorts");
export const CRM_CLIENTS_PORTS = Symbol("CrmClientsPorts");
export const CRM_CHATS_PORTS = Symbol("CrmChatsPorts");
