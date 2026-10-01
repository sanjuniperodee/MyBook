import { AggregateRoot } from "@/shared/domain";
import { getPlan, type DeliveryId, type PlanId } from "@/config/site";
import { calculatePrice, type PriceBreakdown } from "./Pricing";
import { OrderingError } from "./errors";
import { OrderingEvents, type OrderRef } from "./events";
import type { OrderStatus } from "./OrderStatus";
import type { PromoCode } from "./PromoCode";

export interface OrderContact {
  name: string;
  phone: string;
  email: string;
}

export interface OrderDelivery {
  method: DeliveryId | null;
  city: string | null;
  address: string | null;
  postalCode: string | null;
}

export interface OrderPrintSpec {
  format: string;
  pageCount: number;
  spineMm: number;
  coverWidthMm: number;
  coverHeightMm: number;
  generatedAt: string;
}

/** Запись журнала заказа (видна в CRM). */
export interface OrderHistoryEntry {
  status: OrderStatus | null;
  note: string;
  actor: string;
  at: Date;
}

export interface OrderProps {
  number: number;
  userId: string;
  bookId: string;
  plan: PlanId;
  quantity: number;
  price: PriceBreakdown;
  promoCode: string | null;
  currency: string;
  status: OrderStatus;
  paymentProvider: string;
  paymentId: string | null;
  paymentClaimedAt: Date | null;
  contact: OrderContact;
  delivery: OrderDelivery;
  customerComment: string | null;
  giftNote: string | null;
  desiredDate: string | null;
  surprise: boolean;
  trackingNumber: string | null;
  adminNote: string | null;
  printSpec: OrderPrintSpec | null;
  assigneeId: string | null;
  paidAt: Date | null;
  createdAt: Date;
}

export interface PlaceOrderInput {
  id: string;
  number: number;
  userId: string;
  bookId: string;
  plan: PlanId;
  quantity: number;
  delivery: OrderDelivery;
  addons: readonly string[];
  contact: OrderContact;
  promo: PromoCode | null;
  currency: string;
  paymentProvider: string;
  customerComment?: string | null;
  giftNote?: string | null;
  desiredDate?: string | null;
  surprise?: boolean;
  /** Оценка числа страниц книги на момент заказа — для журнала. */
  estimatedPages: number;
  formatMoney: (n: number) => string;
}

/**
 * Заказ — корень агрегата. Цена считается здесь и только здесь; статус меняется
 * только методами, которые знают правила переходов и пишут журнал.
 */
export class Order extends AggregateRoot<OrderProps> {
  #newHistory: OrderHistoryEntry[] = [];

  private constructor(id: string, props: OrderProps) {
    super(id, props);
  }

  static restore(id: string, props: OrderProps) {
    return new Order(id, props);
  }

  static place(input: PlaceOrderInput, now: Date): Order {
    const plan = getPlan(input.plan);
    if (!plan) throw new OrderingError("bookNotFound", `unknown plan ${input.plan}`);
    if (input.promo) input.promo.assertUsable(now);
    const delivery: OrderDelivery = plan.printed ? input.delivery : { method: null, city: null, address: null, postalCode: null };
    const price = calculatePrice(plan.id, input.quantity, delivery.method, input.promo?.discount ?? null, input.addons);
    const order = new Order(input.id, {
      number: input.number,
      userId: input.userId,
      bookId: input.bookId,
      plan: plan.id,
      quantity: plan.printed ? Math.min(Math.max(1, Math.floor(input.quantity)), 20) : 1,
      price,
      promoCode: input.promo?.code ?? null,
      currency: input.currency,
      status: "pending_payment",
      paymentProvider: input.paymentProvider,
      paymentId: null,
      paymentClaimedAt: null,
      contact: input.contact,
      delivery,
      customerComment: input.customerComment || null,
      giftNote: plan.printed ? input.giftNote || null : null,
      desiredDate: plan.printed ? input.desiredDate || null : null,
      surprise: plan.printed && !!input.surprise,
      trackingNumber: null,
      adminNote: null,
      printSpec: null,
      assigneeId: null,
      paidAt: null,
      createdAt: now,
    });
    const promoNote = input.promo ? `, промокод ${input.promo.code} (${input.promo.describe(input.formatMoney)})` : "";
    order.log("pending_payment", `Заказ создан, ${input.estimatedPages} стр. (оценка)${promoNote}`, "customer", now);
    order.record(OrderingEvents.orderPlaced({ ...order.ref(), estimatedPages: input.estimatedPages, quantity: order.props.quantity }));
    return order;
  }

  // ─── чтение ──────────────────────────────────────────────────────────────

  get number() {
    return this.props.number;
  }
  get status() {
    return this.props.status;
  }
  get userId() {
    return this.props.userId;
  }
  get bookId() {
    return this.props.bookId;
  }
  get amount() {
    return this.props.price.amount;
  }
  get currency() {
    return this.props.currency;
  }
  get promoCode() {
    return this.props.promoCode;
  }
  get plan() {
    return this.props.plan;
  }
  get isPrinted() {
    return !!getPlan(this.props.plan)?.printed;
  }
  get isFree() {
    return this.props.price.amount === 0;
  }
  get assigneeId() {
    return this.props.assigneeId;
  }

  /** Новые записи журнала — забирает репозиторий при сохранении. */
  pullHistory(): OrderHistoryEntry[] {
    const h = this.#newHistory;
    this.#newHistory = [];
    return h;
  }

  ref(): OrderRef {
    const p = this.props;
    return { orderId: this.id, number: p.number, userId: p.userId, bookId: p.bookId, plan: p.plan, amount: p.price.amount, contactName: p.contact.name, contactPhone: p.contact.phone, contactEmail: p.contact.email, promoCode: p.promoCode };
  }

  /** Совпадает ли платёж платёжной системы с заказом (защита от подмены суммы). */
  matchesPayment(amount: number, currency?: string | null) {
    return Math.round(amount) === this.props.price.amount && (!currency || currency === this.props.currency);
  }

  // ─── команды ─────────────────────────────────────────────────────────────

  /** Подтверждение оплаты. Повторное уведомление платёжной системы — без последствий (false). */
  markPaid(paymentId: string | null, actor: string, now: Date): boolean {
    if (this.props.status !== "pending_payment") return false;
    this.props.status = "paid";
    this.props.paidAt = now;
    if (paymentId) this.props.paymentId = paymentId;
    this.log("paid", paymentId ? `Платёж ${paymentId}` : "Оплата подтверждена", actor, now);
    this.record(OrderingEvents.orderPaid({ ...this.ref(), paymentId, actor }));
    return true;
  }

  /**
   * Смена статуса сотрудником (канбан, карточка заказа). Оплата и отмена идут через свои методы,
   * чтобы сработали их правила (промокод, блокировка книги, события).
   */
  changeStatus(to: OrderStatus, actor: string, note: string, now: Date): { cancelled: boolean; releasePromo: boolean } {
    const from = this.props.status;
    const none = { cancelled: false, releasePromo: false };
    if (to === from) {
      if (note) this.log(null, note, actor, now);
      return none;
    }
    if (to === "cancelled") return { cancelled: true, ...this.cancel(actor, note, now) };
    if (to === "paid" && from === "pending_payment") {
      this.markPaid(null, actor, now);
      if (note) this.log(null, note, actor, now);
      return none;
    }
    if (from === "cancelled" && to === "pending_payment") throw new OrderingError("invalidTransition", "cancelled order cannot wait for payment again");
    this.props.status = to;
    if (to === "paid" && !this.props.paidAt) this.props.paidAt = now;
    this.log(to, note, actor, now);
    this.record(OrderingEvents.statusChanged({ ...this.ref(), from, to, trackingNumber: this.props.trackingNumber, actor }));
    return none;
  }

  /** Отмена. Возвращает true, если неоплаченный заказ занимал промокод — его нужно вернуть. */
  cancel(actor: string, note: string, now: Date): { releasePromo: boolean } {
    const from = this.props.status;
    if (from === "cancelled") return { releasePromo: false };
    this.props.status = "cancelled";
    const releasePromo = from === "pending_payment" && !!this.props.promoCode;
    this.log("cancelled", note, actor, now);
    this.record(OrderingEvents.orderCancelled({ ...this.ref(), wasPaid: from !== "pending_payment", releasedPromo: releasePromo, actor }));
    return { releasePromo };
  }

  /** Клиент отменяет сам — только пока не оплатил. */
  cancelByCustomer(now: Date) {
    if (this.props.status !== "pending_payment") throw new OrderingError("invalidTransition", "only unpaid orders can be cancelled by customer");
    return this.cancel("customer", "Отменён клиентом", now);
  }

  /** Клиент сообщил, что оплатил переводом (ручная оплата). */
  claimPayment(now: Date): boolean {
    if (this.props.status !== "pending_payment" || this.props.paymentClaimedAt) return false;
    this.props.paymentClaimedAt = now;
    this.log(null, "Клиент сообщил об оплате переводом", "customer", now);
    this.record(OrderingEvents.paymentClaimed(this.ref()));
    return true;
  }

  recordPaymentFailure(reason: string, actor: string, now: Date) {
    this.log(null, `Неуспешная оплата: ${reason || "без причины"}`, actor, now);
  }

  setTrackingNumber(value: string | null) {
    this.props.trackingNumber = value?.trim() || null;
  }

  addNote(note: string, actor: string, now: Date) {
    if (note.trim()) this.log(null, note.trim(), actor, now);
  }

  setAdminNote(note: string) {
    this.props.adminNote = note.slice(0, 5000) || null;
  }

  assign(assigneeId: string | null, label: string, actor: string, now: Date) {
    this.props.assigneeId = assigneeId;
    this.log(null, `Ответственный: ${assigneeId ? label : "снят"}`, actor, now);
  }

  updateDetails(contact: OrderContact, delivery: OrderDelivery, extra: { desiredDate: string | null; giftNote: string | null }, actor: string, now: Date) {
    this.props.contact = contact;
    this.props.delivery = delivery;
    this.props.desiredDate = extra.desiredDate;
    this.props.giftNote = extra.giftNote;
    this.log(null, "Контакты и доставка изменены", actor, now);
  }

  recordPrintSpec(spec: OrderPrintSpec) {
    this.props.printSpec = spec;
  }

  private log(status: OrderStatus | null, note: string, actor: string, at: Date) {
    this.#newHistory.push({ status, note, actor, at });
  }
}
