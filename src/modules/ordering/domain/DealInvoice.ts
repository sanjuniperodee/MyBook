import { AggregateRoot, domainEvent, type DomainEvent } from "@/shared/domain";

export type DealInvoiceStatus = "pending_payment" | "paid" | "cancelled" | "expired";
export type DealInvoicePurpose = "prepayment" | "remainder" | "full" | "custom";
export type DealInvoiceMethod = "manual" | "kaspi" | "cloudpayments";
/** Доступ в кабинет после оплаты: ждёт выдачи, отправлен, доставлен, не ушёл, нужен менеджер (чей аккаунт — неясно), не нужен. */
export type AccessStatus = "none" | "due" | "sent" | "delivered" | "failed" | "needs_manager" | "skipped";

/** Сколько действует счёт. */
export const DEAL_INVOICE_TTL_MS = 7 * 86_400_000;

export interface DealInvoiceProps {
  number: number;
  token: string;
  dealId: string;
  conversationId: string | null;
  /** Номер WhatsApp-чата (цифры): по нему находится или заводится аккаунт клиента. */
  phone: string | null;
  clientName: string;
  locale: "ru" | "kk";
  channel: string;
  plan: string;
  /** Цена одной книги по договорённости. */
  agreedTotal: number;
  /** Сколько книг оплачивает счёт: договорённость по нему — agreedTotal × booksCount. */
  booksCount: number;
  amount: number;
  purpose: DealInvoicePurpose;
  status: DealInvoiceStatus;
  paidMethod: DealInvoiceMethod | null;
  paidRef: string | null;
  paidAt: Date | null;
  claimedAt: Date | null;
  closedReason: string | null;
  expiresAt: Date;
  issuedById: string | null;
  accessStatus: AccessStatus;
  accessUserId: string | null;
  /** Сообщение с доступом в чате (по нему — статус доставки). */
  accessMessageId: string | null;
  /** Когда проход планировщика взял выдачу доступа (захват с таймаутом). */
  accessAttemptedAt: Date | null;
  /** Ключ формы выпуска: повторное нажатие возвращает тот же счёт. */
  issueKey: string | null;
  createdAt: Date;
}

export interface DealInvoiceRef {
  invoiceId: string;
  number: number;
  dealId: string;
  amount: number;
}

/** Счёт оплачен (первый раз): деньги записаны в сделку; дальше — клиент, доступ, заметка, уведомление. */
export type DealInvoicePaid = DomainEvent<"ordering.deal_invoice_paid", DealInvoiceRef & { method: DealInvoiceMethod; ref: string | null; conversationId: string | null; phone: string | null; clientName: string; locale: "ru" | "kk"; channel: string; issuedById: string | null }>;
/** Деньги пришли по закрытому счёту (повторная оплата, после заказа, по отменённому) — нужен возврат или зачёт. */
export type DealInvoiceExtraMoney = DomainEvent<"ordering.deal_invoice_extra_money", DealInvoiceRef & { method: DealInvoiceMethod; ref: string; paid: number; recorded: boolean; reason: "overpaid" | "closed" | "order" | "mismatch" }>;
/** Клиент сообщил, что оплатил переводом. */
export type DealInvoiceClaimed = DomainEvent<"ordering.deal_invoice_claimed", DealInvoiceRef>;
/** Счёт закрыт без оплаты (отменён, истёк): ждущую попытку Kaspi по нему — отменить (сначала сверив с Kaspi). */
export type DealInvoiceClosed = DomainEvent<"ordering.deal_invoice_closed", DealInvoiceRef & { reason: string }>;
export type DealInvoiceEvent = DealInvoicePaid | DealInvoiceExtraMoney | DealInvoiceClaimed | DealInvoiceClosed;

/**
 * Счёт из чата: менеджер просит клиента оплатить часть договорённости (предоплата, остаток) по ссылке. Один открытый
 * счёт на сделку; оплаченный — окончателен. Деньги, пришедшие по закрытому счёту, не теряются: они записываются,
 * если сделку ещё можно зачесть, и всегда — событие «нужен возврат или зачёт».
 */
export class DealInvoice extends AggregateRoot<DealInvoiceProps> {
  static restore(id: string, props: DealInvoiceProps) {
    return new DealInvoice(id, props);
  }

  static issue(id: string, input: Omit<DealInvoiceProps, "status" | "paidMethod" | "paidRef" | "paidAt" | "claimedAt" | "closedReason" | "expiresAt" | "accessStatus" | "accessUserId" | "accessMessageId" | "accessAttemptedAt" | "createdAt" | "booksCount"> & { booksCount?: number }, now: Date) {
    return new DealInvoice(id, { ...input, booksCount: input.booksCount ?? 1, status: "pending_payment", paidMethod: null, paidRef: null, paidAt: null, claimedAt: null, closedReason: null, expiresAt: new Date(now.getTime() + DEAL_INVOICE_TTL_MS), accessStatus: "none", accessUserId: null, accessMessageId: null, accessAttemptedAt: null, createdAt: now });
  }

  get number() {
    return this.props.number;
  }
  get token() {
    return this.props.token;
  }
  get dealId() {
    return this.props.dealId;
  }
  get amount() {
    return this.props.amount;
  }
  get status() {
    return this.props.status;
  }
  get paidRef() {
    return this.props.paidRef;
  }
  get label() {
    return `P${this.props.number}`;
  }

  ref(): DealInvoiceRef {
    return { invoiceId: this.id, number: this.props.number, dealId: this.props.dealId, amount: this.props.amount };
  }

  /** Можно платить: ждёт оплаты и не истёк. */
  isPayable(now: Date) {
    return this.props.status === "pending_payment" && this.props.expiresAt > now;
  }

  matchesAmount(amount: number) {
    return Math.round(amount) === this.props.amount;
  }

  /** Деньги по счёту пришли и записаны в сделку. Возвращает false, если счёт уже не ждал оплаты (тогда — extraMoney). */
  markPaid(method: DealInvoiceMethod, ref: string | null, now: Date): boolean {
    if (this.props.status === "paid") return false;
    this.props.status = "paid";
    this.props.paidMethod = method;
    this.props.paidRef = ref;
    this.props.paidAt = now;
    this.props.accessStatus = this.props.accessStatus === "none" ? "due" : this.props.accessStatus;
    const p = this.props;
    this.record(domainEvent("ordering.deal_invoice_paid", { ...this.ref(), method, ref, conversationId: p.conversationId, phone: p.phone, clientName: p.clientName, locale: p.locale, channel: p.channel, issuedById: p.issuedById }) satisfies DealInvoicePaid);
    return true;
  }

  /** Деньги, которые нельзя засчитать этим счётом: повтор оплаты, оплата закрытого счёта или после заказа. */
  extraMoney(method: DealInvoiceMethod, ref: string, paid: number, recorded: boolean, reason: DealInvoiceExtraMoney["payload"]["reason"]) {
    this.record(domainEvent("ordering.deal_invoice_extra_money", { ...this.ref(), method, ref, paid, recorded, reason }) satisfies DealInvoiceExtraMoney);
  }

  claim(now: Date): boolean {
    if (!this.isPayable(now) || this.props.claimedAt) return false;
    this.props.claimedAt = now;
    this.record(domainEvent("ordering.deal_invoice_claimed", this.ref()) satisfies DealInvoiceClaimed);
    return true;
  }

  /** Закрыть ждущий счёт: менеджер отменил, выставлен новый, оформлен заказ, сделка закрыта. */
  cancel(reason: string): boolean {
    if (this.props.status !== "pending_payment") return false;
    this.props.status = "cancelled";
    this.props.closedReason = reason.slice(0, 200);
    this.record(domainEvent("ordering.deal_invoice_closed", { ...this.ref(), reason: this.props.closedReason }) satisfies DealInvoiceClosed);
    return true;
  }

  expire(now: Date): boolean {
    if (this.props.status !== "pending_payment" || this.props.expiresAt > now) return false;
    this.props.status = "expired";
    this.props.closedReason = "срок счёта истёк";
    this.record(domainEvent("ordering.deal_invoice_closed", { ...this.ref(), reason: this.props.closedReason }) satisfies DealInvoiceClosed);
    return true;
  }

  setAccess(status: AccessStatus, userId?: string | null, messageId?: string | null) {
    this.props.accessStatus = status;
    if (userId !== undefined) this.props.accessUserId = userId;
    if (messageId !== undefined) this.props.accessMessageId = messageId;
    // Новая просьба выдать доступ (менеджер, повтор) освобождает захват: проход возьмёт её заново.
    if (status === "due") this.props.accessAttemptedAt = null;
  }

  /** Доступ в кабинет по счёту: статус, кому выдан, сообщение в чате, когда проход взял выдачу. */
  get access() {
    const p = this.props;
    return { status: p.accessStatus, userId: p.accessUserId, messageId: p.accessMessageId, attemptedAt: p.accessAttemptedAt };
  }

  /**
   * Проход планировщика берёт выдачу доступа: только оплаченный счёт с доступом «ждёт выдачи», которого никто не взял
   * за последние leaseMs (упавший проход отпускает счёт по таймауту). false — занят или выдавать нечего.
   */
  claimAccess(now: Date, leaseMs: number): boolean {
    if (this.props.status !== "paid" || this.props.accessStatus !== "due") return false;
    const taken = this.props.accessAttemptedAt;
    if (taken && now.getTime() - taken.getTime() < leaseMs) return false;
    this.props.accessAttemptedAt = now;
    return true;
  }

  /** Итог выдачи — только тем проходом, который её взял (менеджер мог попросить выдать заново, пока шла отправка). */
  finishAccess(claimedAt: Date, status: Exclude<AccessStatus, "none" | "due">, userId: string | null, messageId: string | null): boolean {
    if (this.props.accessStatus !== "due" || this.props.accessAttemptedAt?.getTime() !== claimedAt.getTime()) return false;
    this.props.accessStatus = status;
    this.props.accessUserId = userId;
    this.props.accessMessageId = messageId;
    return true;
  }
}
