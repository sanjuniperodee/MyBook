import { AggregateRoot } from "@/shared/domain";
import { formatPrice, getDeliveryOptions, getPlan, isAbroadDelivery, isQuotedDelivery, type DeliveryId, type PlanId } from "@/config/site";
import { calculatePrice, type Agreement, type Discount, type PriceBreakdown } from "./Pricing";
import { OrderingError } from "./errors";
import { OrderingEvents, type OrderRef } from "./events";
import { isPaid } from "./OrderStatus";
import type { OrderPrintSpec, OrderStatus } from "@/shared/domain/orders";
import type { PromoCode } from "./PromoCode";

export interface OrderContact {
  name: string;
  phone: string;
  email: string;
}

export interface OrderDelivery {
  method: DeliveryId | null;
  /** Страна — только для доставки в другую страну (стоимость считает менеджер); иначе Казахстан и null. */
  country?: string | null;
  city: string | null;
  address: string | null;
  postalCode: string | null;
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
  /** Постоплата: в печати без оплаты, выручка — когда деньги покроют «к оплате». */
  postpay: boolean;
  /** Сколько денег получено по заказу (журнал оплат) — учёт денег, не выручка. */
  receivedAmount: number;
  createdAt: Date;
}

/** Деньги по заказу: перевод с чеком (сотрудник) или онлайн (платёжная система). */
export interface OrderMoney {
  paymentId: string;
  amount: number;
  method: "manual" | "kaspi" | "cloudpayments";
  paidAt: Date;
  /** Как записать в журнал заказа: «перевод, чек …», «Kaspi, операция …». */
  label: string;
  actor: string;
}

export const ORDER_MONEY_LABELS: Record<OrderMoney["method"], string> = { manual: "перевод", kaspi: "Kaspi", cloudpayments: "карта" };

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
  /** Договорённая цена и внесённая предоплата по ручной сделке клиента (если есть). */
  agreement?: Agreement | null;
  /** Сделка этой договорённости — в событие «заказ оформлен», чтобы продажи привязали заказ к ней, а не завели новую. */
  agreementDealId?: string | null;
  /** Печатная версия к уже оплаченной электронной: её оплата засчитывается (в agreement — как аванс), здесь — для журнала. */
  credit?: { orderNumber: number; amount: number } | null;
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
    // Страна нужна только доставке в другую страну: у остальных способов это Казахстан.
    const delivery: OrderDelivery = plan.printed ? { ...input.delivery, country: isAbroadDelivery(input.delivery.method) ? input.delivery.country?.trim() || null : null } : { method: null, country: null, city: null, address: null, postalCode: null };
    const price = calculatePrice(plan.id, input.quantity, delivery.method, input.promo?.discount ?? null, input.addons, input.agreement ?? null);
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
      postpay: false,
      receivedAmount: 0,
      createdAt: now,
    });
    const promoNote = input.promo ? `, промокод ${input.promo.code} (${input.promo.describe(input.formatMoney)})` : "";
    // Договорённость (итог зафиксирован) или аванс (обычная цена, внесённые деньги — в зачёт).
    const agreed =
      price.prepaidAmount === undefined
        ? ""
        : Number.isFinite(input.agreement?.agreedTotal)
          ? `, по договорённости с менеджером: итог ${input.formatMoney(price.amount + price.prepaidAmount)}, предоплата ${input.formatMoney(price.prepaidAmount)} учтена`
          : `, предоплата ${input.formatMoney(price.prepaidAmount)} учтена как аванс`;
    const credited = input.credit && input.credit.amount > 0 ? `, засчитана оплата электронной версии (заказ №${input.credit.orderNumber}): ${input.formatMoney(input.credit.amount)}` : input.credit ? `, печатная версия к электронной (заказ №${input.credit.orderNumber})` : "";
    // Бесплатное по договорённости — в журнал заказа: в сумме его не видно (0 ₸), а производство и доставка должны знать.
    const quoted = isQuotedDelivery(delivery.method, price.gifted);
    order.log("pending_payment", `Заказ создан, ${input.estimatedPages} стр. (оценка)${promoNote}${input.credit ? credited : agreed}${price.gifted?.length ? `; бесплатно по договорённости с менеджером: ${price.gifted.map((g) => (g === "giftwrap" ? "подарочная упаковка" : "доставка")).join(", ")}` : ""}${quoted ? `; доставка (${[delivery.country, delivery.city].filter(Boolean).join(", ") || "адрес не указан"}) — в сумму не входит, стоимость рассчитывается индивидуально` : ""}`, "customer", now);
    // Внесено по договорённости больше итога (зачёт — не больше итога): разницу нужно вернуть клиенту.
    const prepaidExcess = input.agreement && !input.credit ? Math.max(0, Math.round(input.agreement.prepaid) - (price.prepaidAmount ?? 0)) : 0;
    if (prepaidExcess > 0) order.notePrepaidExcess(prepaidExcess, now);
    order.record(OrderingEvents.orderPlaced({ ...order.ref(), estimatedPages: input.estimatedPages, quantity: order.props.quantity, agreementDealId: input.agreement ? (input.agreementDealId ?? null) : null, prepaidExcess, ...(quoted ? { deliveryQuoted: { method: delivery.method!, country: delivery.country ?? null, city: delivery.city } } : {}) }));
    return order;
  }

  /** Переплата по договорённости при оформлении — в журнал заказа (задачу ответственному ставит подписчик события). */
  private notePrepaidExcess(excess: number, now: Date) {
    this.log(null, `Переплата ${formatPrice(excess)} по договорённости — нужен возврат`, "customer", now);
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
  /** Получено денег по заказу. */
  get received() {
    return this.props.receivedAmount;
  }
  /** Сколько ещё должен клиент по заказу (к оплате − получено). */
  get outstanding() {
    return Math.max(0, this.props.price.amount - this.props.receivedAmount);
  }
  get postpay() {
    return this.props.postpay;
  }
  /** Выручка признана (оплачен или постоплата получена полностью). */
  get isSettled() {
    return !!this.props.paidAt && this.props.status !== "cancelled";
  }

  /** Новые записи журнала — забирает репозиторий при сохранении. */
  pullHistory(): OrderHistoryEntry[] {
    const h = this.#newHistory;
    this.#newHistory = [];
    return h;
  }

  ref(): OrderRef {
    const p = this.props;
    return { orderId: this.id, number: p.number, userId: p.userId, bookId: p.bookId, plan: p.plan, amount: p.price.amount, prepaid: p.price.prepaidAmount ?? 0, contactName: p.contact.name, contactPhone: p.contact.phone, contactEmail: p.contact.email, promoCode: p.promoCode };
  }

  /** Совпадает ли платёж платёжной системы с заказом (защита от подмены суммы). */
  matchesPayment(amount: number, currency?: string | null) {
    return Math.round(amount) === this.props.price.amount && (!currency || currency === this.props.currency);
  }

  // ─── команды ─────────────────────────────────────────────────────────────

  /** Платёж, которым заказ оплачен (id операции платёжной системы). */
  get paymentId() {
    return this.props.paymentId;
  }

  /**
   * Деньги по заказу. Покрыли «к оплате»: ждущий оплаты — оплачен; на постоплате — выручка с даты этих денег.
   * Больше, чем к оплате, или по отменённому заказу (онлайн-деньги пришли, их не вернуть автоматически) — событие
   * «переплата»: нужен возврат или зачёт. Ручной перевод по отменённому заказу не принимается.
   */
  receiveMoney(m: OrderMoney): { settled: boolean; overpaid: number } {
    const cancelled = this.props.status === "cancelled";
    if (cancelled && m.method === "manual") throw new OrderingError("paymentRule", "Заказ отменён — оплату по нему не принять");
    const before = this.props.receivedAmount;
    this.props.receivedAmount = before + m.amount;
    const due = this.props.price.amount;
    this.log(null, `Оплата ${formatPrice(m.amount)} получена (${m.label})${cancelled ? " — заказ отменён, нужен возврат" : ""}`, m.actor, m.paidAt);
    let settled = false;
    if (!cancelled && this.props.receivedAmount >= due) {
      if (this.props.status === "pending_payment") settled = this.markPaid(m.paymentId, m.actor, m.paidAt);
      else if (!this.props.paidAt) {
        // Постоплата: заказ уже в печати или доставлен — статус не меняется, выручка признаётся с даты денег.
        this.props.paidAt = m.paidAt;
        if (m.paymentId) this.props.paymentId = m.paymentId;
        this.log(null, "Постоплата получена полностью", m.actor, m.paidAt);
        this.record(OrderingEvents.orderPaid({ ...this.ref(), paymentId: m.paymentId, actor: m.actor, settled: true }));
        settled = true;
      }
    }
    const overpaid = cancelled ? m.amount : Math.max(0, this.props.receivedAmount - Math.max(due, before));
    if (overpaid > 0) this.record(OrderingEvents.orderOverpaid({ ...this.ref(), overpaid, method: m.method }));
    return { settled, overpaid };
  }

  /**
   * Постоплата: ждущий оплаты заказ — в печать без денег (договорились, что клиент заплатит после). В выручку не попадает,
   * пока деньги не покроют «к оплате»; доставлен без полной оплаты — задача «получить постоплату».
   */
  startPostpay(reason: string, actor: string, now: Date) {
    if (this.props.status !== "pending_payment") throw new OrderingError("paymentRule", "В печать с постоплатой — только заказ, который ждёт оплаты");
    const from = this.props.status;
    this.props.status = "in_production";
    this.props.postpay = true;
    this.log("in_production", `В печать с постоплатой: ждём ${formatPrice(this.outstanding)}${reason ? `. ${reason}` : ""}`, actor, now);
    this.record(OrderingEvents.statusChanged({ ...this.ref(), from, to: "in_production", trackingNumber: this.props.trackingNumber, actor }));
  }

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
    // Отменённый неоплаченный заказ не оживает в обход оплаты (печать, «оплачен», «доставлен»); оплаченный — можно вернуть по ошибке отмены.
    if (from === "cancelled" && !this.props.paidAt) throw new OrderingError("paymentRule", "Заказ отменён и не оплачен: оформите новый заказ или примите оплату по нему отдельно");
    // Неоплаченный заказ не уходит в печать и дальше в обход: оплата или явная постоплата (иначе деньги «потеряются»).
    if (from === "pending_payment" && to !== "paid") throw new OrderingError("paymentRule", "Заказ не оплачен: примите оплату или отправьте в печать с постоплатой");
    this.props.status = to;
    if (to === "paid" && !this.props.paidAt) this.props.paidAt = now;
    this.log(to, note, actor, now);
    this.record(OrderingEvents.statusChanged({ ...this.ref(), from, to, trackingNumber: this.props.trackingNumber, actor }));
    // Отправлен с трек-номером: клиенту есть что отследить (трек вписали раньше или в той же форме).
    if (to === "shipped" && this.props.trackingNumber) this.record(OrderingEvents.trackingAdded({ ...this.ref(), trackingNumber: this.props.trackingNumber, afterShipping: false, actor }));
    if (to === "delivered" && this.props.postpay && !this.props.paidAt) this.record(OrderingEvents.postpayDue({ ...this.ref(), outstanding: this.outstanding }));
    return none;
  }

  /** Отмена. Возвращает true, если неоплаченный заказ занимал промокод — его нужно вернуть. */
  cancel(actor: string, note: string, now: Date): { releasePromo: boolean } {
    const from = this.props.status;
    if (from === "cancelled") return { releasePromo: false };
    this.props.status = "cancelled";
    const releasePromo = from === "pending_payment" && !!this.props.promoCode;
    this.log("cancelled", note, actor, now);
    this.record(OrderingEvents.orderCancelled({ ...this.ref(), wasPaid: isPaid(from), releasedPromo: releasePromo, actor }));
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

  /**
   * Трек-номер посылки. Новый трек у отправленного заказа — событие «трек-номер появился»: клиенту его сообщат письмо и
   * правила CRM (automation-d12 — письмо «Книга в пути» ушло раньше, чем вписали трек). У заказа, который ещё не
   * отправлен, событие будет при переводе в «Отправлен». Доставленному — без события: книга уже у клиента, трек вписали
   * для истории. Тот же трек повторно — без события.
   */
  setTrackingNumber(value: string | null, actor = "system") {
    const next = value?.trim() || null;
    if (next === this.props.trackingNumber) return;
    this.props.trackingNumber = next;
    if (next && this.props.status === "shipped") this.record(OrderingEvents.trackingAdded({ ...this.ref(), trackingNumber: next, afterShipping: true, actor }));
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
    const before = this.props.delivery.method;
    this.props.contact = contact;
    this.props.delivery = { ...delivery, country: isAbroadDelivery(delivery.method) ? delivery.country?.trim() || null : null };
    this.props.desiredDate = extra.desiredDate;
    this.props.giftNote = extra.giftNote;
    this.log(null, "Контакты и доставка изменены", actor, now);
    if (delivery.method !== before) this.repriceDelivery(actor, now);
  }

  /**
   * Сменили способ доставки (deals-d10): у неоплаченного заказа «к оплате» пересчитывается на разницу в цене доставки —
   * иначе клиент заплатил бы старую сумму. Доставка в подарок по договорённости остаётся бесплатной. Оплаченный заказ
   * не трогаем: деньги уже получены, разницу менеджер решает сам — пометка в журнале.
   */
  private repriceDelivery(actor: string, now: Date) {
    const plan = getPlan(this.props.plan);
    if (!plan?.printed) return;
    const price = this.props.price;
    const free = price.gifted?.includes("delivery") ?? false;
    const next = free ? 0 : (getDeliveryOptions().find((d) => d.id === this.props.delivery.method)?.price ?? 0);
    const diff = next - price.deliveryAmount;
    if (!diff) return;
    if (this.props.status !== "pending_payment") {
      this.log(null, `Доставка стоит ${diff > 0 ? "дороже" : "дешевле"} на ${formatPrice(Math.abs(diff))}, но заказ уже оплачен — сумма не пересчитана`, actor, now);
      return;
    }
    this.props.price = { ...price, deliveryAmount: next, amount: Math.max(0, price.amount + diff) };
    this.log(null, `Сумма пересчитана за доставку: ${formatPrice(price.amount)} → ${formatPrice(this.props.price.amount)}`, actor, now);
  }

  /**
   * Сотрудник меняет тариф и договорённую цену книги неоплаченного заказа: цена пересчитывается как при оформлении
   * (доставка, допы и экземпляры сверху, скидка промокода и внесённая предоплата сохраняются). agreedTotal — null: по прайсу тарифа.
   * Оплаченный и отменённый заказ не трогаем: деньги уже учтены. Если полученное покрывает новую сумму — заказ оплачен,
   * если больше — задача «возврат или зачёт».
   */
  changeTerms(input: { plan: PlanId; agreedTotal: number | null; discount: Discount | null; planName: (id: PlanId) => string }, actor: string, now: Date) {
    if (this.props.status === "cancelled") throw new OrderingError("paymentRule", "Заказ отменён: тариф и сумму не изменить");
    if (this.props.paidAt) throw new OrderingError("paymentRule", "Заказ уже оплачен: тариф и сумму не изменить");
    const plan = getPlan(input.plan);
    if (!plan) throw new OrderingError("paymentRule", `Тариф «${input.plan}» не найден`);
    const agreedTotal = input.agreedTotal;
    if (agreedTotal !== null && !(Number.isInteger(agreedTotal) && agreedTotal > 0)) throw new OrderingError("paymentRule", "Договорённая сумма — целое число тенге больше нуля");
    const before = this.props.price;
    const prepaid = before.prepaidAmount ?? 0;
    // Договорённая цена — со своими подарками; без неё — прайс тарифа (предоплата остаётся авансом).
    const agreement: Agreement | null = agreedTotal !== null ? { agreedTotal, prepaid, plan: plan.id, gifts: before.gifted } : prepaid > 0 ? { agreedTotal: Number.POSITIVE_INFINITY, prepaid } : null;
    // У электронной версии нет печати и доставки; у печатной они задаются в «Правке данных».
    const delivery: OrderDelivery = plan.printed ? this.props.delivery : { method: null, country: null, city: null, address: null, postalCode: null };
    const price = calculatePrice(plan.id, this.props.quantity, delivery.method, input.discount, this.props.price.addons, agreement);
    const planBefore = this.props.plan;
    this.props.plan = plan.id;
    this.props.quantity = plan.printed ? this.props.quantity : 1;
    this.props.delivery = delivery;
    if (!plan.printed) {
      this.props.giftNote = null;
      this.props.desiredDate = null;
      this.props.surprise = false;
    }
    this.props.price = price;
    const parts = [
      planBefore !== plan.id ? `тариф ${input.planName(planBefore)} → ${input.planName(plan.id)}` : null,
      `к оплате ${formatPrice(before.amount)} → ${formatPrice(price.amount)}`,
      agreedTotal !== null ? `договорённая цена книги ${formatPrice(agreedTotal)}` : "цена по прайсу тарифа",
    ].filter(Boolean);
    this.log(null, `Условия изменены: ${parts.join(", ")}`, actor, now);
    // Внесённая предоплата больше нового итога: зачёт не больше итога, разницу нужно вернуть клиенту.
    const prepaidExcess = Math.max(0, prepaid - (price.prepaidAmount ?? 0));
    if (prepaidExcess > 0) this.notePrepaidExcess(prepaidExcess, now);
    if (planBefore !== plan.id || before.amount !== price.amount) this.record(OrderingEvents.orderRepriced({ ...this.ref(), previousAmount: before.amount, previousPlan: planBefore, actor }));
    this.settleIfCovered(actor, now);
  }

  /** Полученные деньги уже покрывают «к оплате» (сумму снизили): заказ оплачен; больше — переплата к возврату. */
  private settleIfCovered(actor: string, now: Date) {
    const due = this.props.price.amount;
    const received = this.props.receivedAmount;
    if (received < due || this.props.status === "cancelled") return;
    if (this.props.status === "pending_payment") this.markPaid(null, actor, now);
    else if (!this.props.paidAt) {
      this.props.paidAt = now;
      this.log(null, "Постоплата получена полностью", actor, now);
      this.record(OrderingEvents.orderPaid({ ...this.ref(), paymentId: null, actor, settled: true }));
    }
    if (received > due) this.record(OrderingEvents.orderOverpaid({ ...this.ref(), overpaid: received - due, method: "reprice" }));
  }

  recordPrintSpec(spec: OrderPrintSpec) {
    this.props.printSpec = spec;
  }

  private log(status: OrderStatus | null, note: string, actor: string, at: Date) {
    this.#newHistory.push({ status, note, actor, at });
  }
}
