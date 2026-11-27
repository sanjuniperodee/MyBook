import { AggregateRoot } from "@/shared/domain";
import { formatPrice, getDeliveryOptions, getPlan, isAbroadDelivery, isQuotedDelivery, type DeliveryId, type PlanId } from "@/config/site";
import { calculatePrice, type Agreement, type Discount, type PriceBreakdown } from "./Pricing";
import { OrderingError } from "./errors";
import { OrderingEvents, type OrderRef } from "./events";
import { isPaid } from "./OrderStatus";
import type { OrderPrintSpec, OrderStatus } from "@/shared/domain/orders";
import type { PromoCode } from "./PromoCode";
import { layoutApprovalRefusal, layoutApprovalRequired, layoutBlock, type CurrentLayout, type LayoutApproval } from "./layoutApproval";

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
  /** Согласование итогового макета клиентом (layoutApproval.ts). */
  layoutApproval: LayoutApproval;
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
      layoutApproval: { required: plan.printed, approvedAt: null, fingerprint: null, revokedAt: null },
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
  get layoutApproval(): LayoutApproval {
    return this.props.layoutApproval;
  }
  /**
   * Сколько можно вернуть клиенту: по отменённому заказу — всё полученное; по живому — только переплату (полученное сверх
   * «к оплате»). Остальное — оплата самого заказа: вернуть её — значит отменить заказ (иначе оплаченный заказ останется
   * без денег, а выручка — на всю сумму).
   */
  get refundable() {
    const received = Math.max(0, this.props.receivedAmount);
    return this.props.status === "cancelled" ? received : Math.max(0, received - this.props.price.amount);
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
  startPostpay(reason: string, actor: string, now: Date, current: CurrentLayout | null = null) {
    if (this.props.status !== "pending_payment") throw new OrderingError("paymentRule", "В печать с постоплатой — только заказ, который ждёт оплаты");
    this.assertLayoutForPrint(current);
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
  changeStatus(to: OrderStatus, actor: string, note: string, now: Date, current: CurrentLayout | null = null): { cancelled: boolean; releasePromo: boolean } {
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
    // В печать — только согласованный клиентом макет (та же проверка, что у печатных файлов).
    if (to === "in_production") this.assertLayoutForPrint(current);
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
   * Сотрудник меняет тариф и договорённую цену книги: цена пересчитывается как при оформлении (доставка, допы и экземпляры
   * сверху, скидка промокода и внесённая предоплата сохраняются). agreedTotal — null: по прайсу тарифа. Отменённый заказ
   * не трогаем. Полученное покрывает новую сумму — заказ оплачен; больше — задача «возврат или зачёт».
   *
   * Оплаченный заказ (выручка признана) — только с `settled` (руководитель, право «Менять цену оплаченного заказа») и
   * причиной, и только цена: тариф оплаченного не меняется (электронную в печатную — upgradeToPrinted). Новая сумма больше
   * полученного — заказ снова ждёт доплату остатка (reopenDue). Если оплата заказа подтверждена без денег в журнале,
   * поднять цену выше записанного нельзя: иначе выручка всего заказа пропала бы — сначала прикладывают оплату с чеком.
   */
  changeTerms(
    input: { plan: PlanId; agreedTotal: number | null; discount: Discount | null; planName: (id: PlanId) => string; settled?: { reason: string } | null },
    actor: string,
    now: Date,
  ): { wasPaid: boolean; previousAmount: number; amount: number; received: number; overpaid: number; outstanding: number; reopened: boolean } {
    if (this.props.status === "cancelled") throw new OrderingError("paymentRule", "Заказ отменён: тариф и сумму не изменить");
    const paid = !!this.props.paidAt;
    const reason = input.settled?.reason.trim() ?? "";
    if (paid && !input.settled) throw new OrderingError("paymentRule", "Заказ уже оплачен: цену меняет руководитель — попросите его, указав договорённую цену и причину");
    if (paid && reason.length < 3) throw new OrderingError("paymentRule", "Укажите причину смены цены оплаченного заказа");
    if (paid && input.plan !== this.props.plan) throw new OrderingError("paymentRule", "У оплаченного заказа меняется только цена, тариф — нет (электронную в печатную — «Перевести в печатную»)");
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
    const received = this.props.receivedAmount;
    if (paid && received < before.amount && price.amount > received)
      throw new OrderingError("paymentRule", `Оплата заказа подтверждена без денег в журнале (записано ${formatPrice(received)} из ${formatPrice(before.amount)}): сначала приложите оплату с чеком в «Оплате», потом меняйте цену`);
    const planBefore = this.props.plan;
    this.props.plan = plan.id;
    if (plan.id !== planBefore) this.syncLayoutRequirement();
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
    this.log(null, `${paid ? "Цена оплаченного заказа изменена" : "Условия изменены"}: ${parts.join(", ")}${paid ? `, получено ${formatPrice(received)}. Причина: ${reason}` : ""}`, actor, now);
    // Внесённая предоплата больше нового итога: зачёт не больше итога, разницу нужно вернуть клиенту.
    const prepaidExcess = Math.max(0, prepaid - (price.prepaidAmount ?? 0));
    if (prepaidExcess > 0) this.notePrepaidExcess(prepaidExcess, now);
    if (planBefore !== plan.id || before.amount !== price.amount) this.record(OrderingEvents.orderRepriced({ ...this.ref(), previousAmount: before.amount, previousPlan: planBefore, actor }));
    const reopened = paid ? this.reopenDue(actor, now) : false;
    // Переплата — только новая (появилась от снижения цены): прежнюю уже отметили задачей при оплате.
    const overpaidBefore = Math.max(0, received - before.amount);
    this.settleIfCovered(actor, now, overpaidBefore);
    return { wasPaid: paid, previousAmount: before.amount, amount: price.amount, received, overpaid: Math.max(0, received - price.amount), outstanding: this.outstanding, reopened };
  }

  /**
   * Оплаченному заказу перестало хватать денег (руководитель поднял цену, отменил ошибочный платёж): выручка больше не
   * признана (paid_at снят — признается, когда деньги покроют «к оплате», с даты этих денег), заказ ждёт доплату остатка.
   * - печатный в статусе «Оплачен» (ещё не в печати) — снова «Ждёт оплаты»: в печать — только после доплаты или явной
   *   постоплаты с причиной, как любой неоплаченный;
   * - электронный «Оплачен» (клиент уже получил книгу) и печатный в печати и дальше — статус прежний, остаток ждём как
   *   постоплату (видно в «Финансах»; доставленному — задача «получить постоплату»).
   * Письмо клиенту о смене статуса не уходит: это исправление учёта, а не новый этап заказа. Возвращает true, если заказ снова ждёт денег.
   */
  private reopenDue(actor: string, now: Date): boolean {
    if (!this.props.paidAt || this.props.status === "cancelled") return false;
    const short = this.props.price.amount - this.props.receivedAmount;
    if (short <= 0) return false;
    this.props.paidAt = null;
    if (this.props.status === "paid" && this.isPrinted) {
      this.props.status = "pending_payment";
      this.props.postpay = false;
      this.log("pending_payment", `Денег не хватает: ждём доплату ${formatPrice(short)} — в печать после оплаты или с постоплатой`, actor, now);
      return true;
    }
    this.props.postpay = true;
    this.log(null, `Денег не хватает: ждём доплату ${formatPrice(short)} (как постоплату), выручка — когда деньги покроют сумму`, actor, now);
    if (this.props.status === "delivered") this.record(OrderingEvents.postpayDue({ ...this.ref(), outstanding: this.outstanding }));
    return true;
  }

  /**
   * Руководитель отменяет ошибочный платёж (не те деньги, фиктивная запись): «получено» уменьшается на платёж (отмена
   * ошибочного возврата — увеличивается), запись остаётся в журнале оплат с пометкой и причиной, а здесь — строка в журнале
   * заказа. also — ещё записи того же заказа той же причиной (фиктивная пара «платёж + возврат»): заказ пересчитывается один
   * раз по итогу, без промежуточной «переплаты» или «ждёт доплату». Итог меньше — не хватает денег, заказ снова ждёт доплату
   * (reopenDue); больше — деньги покрыли «к оплате» (заказ оплачен) или новая переплата — задача «возврат или зачёт».
   */
  voidMoney(v: { kind: "payment" | "refund"; amount: number; label: string; reason: string; actor: string; now: Date; also?: { kind: "payment" | "refund"; amount: number; label: string }[] }): { received: number; outstanding: number; reopened: boolean } {
    const reason = v.reason.trim();
    if (reason.length < 3) throw new OrderingError("paymentRule", "Укажите причину отмены платежа");
    const entries = [{ kind: v.kind, amount: v.amount, label: v.label }, ...(v.also ?? [])];
    for (const e of entries) if (!Number.isInteger(e.amount) || e.amount <= 0) throw new OrderingError("paymentRule", "Сумма платежа — целое число тенге больше нуля");
    const before = this.props.receivedAmount;
    for (const e of entries) {
      const was = this.props.receivedAmount;
      this.props.receivedAmount = e.kind === "refund" ? was + e.amount : was - e.amount;
      this.log(null, `${e.kind === "refund" ? "Возврат" : "Платёж"} ${formatPrice(e.amount)} (${e.label}) отменён как ошибочный: в «получено» не входит. Причина: ${reason}. Получено ${formatPrice(was)} → ${formatPrice(this.props.receivedAmount)}`, v.actor, v.now);
    }
    let reopened = false;
    if (this.props.status !== "cancelled") {
      const after = this.props.receivedAmount;
      if (after < before) reopened = this.reopenDue(v.actor, v.now);
      else if (after > before) this.settleIfCovered(v.actor, v.now, Math.max(0, before - this.props.price.amount), "void");
    }
    return { received: this.props.receivedAmount, outstanding: this.props.status === "cancelled" ? 0 : this.outstanding, reopened };
  }

  /**
   * Полученные деньги уже покрывают «к оплате» (сумму снизили): заказ оплачен; больше — переплата к возврату (задача —
   * только на новую переплату: сверх alreadyOverpaid, о которой уже знают).
   */
  private settleIfCovered(actor: string, now: Date, alreadyOverpaid = 0, method: "reprice" | "void" = "reprice") {
    const due = this.props.price.amount;
    const received = this.props.receivedAmount;
    if (received < due || this.props.status === "cancelled") return;
    if (this.props.status === "pending_payment") this.markPaid(null, actor, now);
    else if (!this.props.paidAt) {
      this.props.paidAt = now;
      this.log(null, "Постоплата получена полностью", actor, now);
      this.record(OrderingEvents.orderPaid({ ...this.ref(), paymentId: null, actor, settled: true }));
    }
    if (received - due > alreadyOverpaid) this.record(OrderingEvents.orderOverpaid({ ...this.ref(), overpaid: received - due, method }));
  }

  /**
   * Возврат клиенту (сотрудник, перевод): деньги заказа уменьшаются на сумму возврата. Не больше refundable — по живому
   * заказу только переплата, поэтому оплаченный заказ остаётся оплаченным, а выручка (paid_at, «к оплате») не меняется.
   */
  refundMoney(r: { amount: number; paidAt: Date; label: string; reason: string; actor: string }): { refundable: number } {
    if (!Number.isInteger(r.amount) || r.amount <= 0) throw new OrderingError("paymentRule", "Сумма возврата — целое число тенге больше нуля");
    const cancelled = this.props.status === "cancelled";
    const limit = this.refundable;
    if (limit <= 0)
      throw new OrderingError("paymentRule", cancelled ? "По заказу нет полученных денег — возвращать нечего" : "Переплаты по заказу нет. Чтобы вернуть оплату заказа, сначала отмените его");
    if (r.amount > limit)
      throw new OrderingError("paymentRule", cancelled ? `Вернуть можно не больше ${formatPrice(limit)} — столько получено по заказу` : `Вернуть можно не больше ${formatPrice(limit)} — это переплата; остальное — оплата заказа`);
    this.props.receivedAmount -= r.amount;
    this.log(null, `Возврат ${formatPrice(r.amount)} клиенту (${r.label}). Причина: ${r.reason}`, r.actor, r.paidAt);
    return { refundable: this.refundable };
  }

  /**
   * Электронную версию — в печатную (сотрудник): клиент доплатил или доплатит. Только оплаченный заказ в статусе «Оплачен»
   * (неоплаченный меняют в «Условиях» — changeTerms). Цена — по прайсу печатного тарифа, как при оформлении: промокод заказа
   * и предоплата по сделке остаются (предоплата — авансом), доставка — та, что в заказе (у электронной её нет: укажут в
   * «Правке данных»). Полученные деньги засчитываются:
   * - хватает — заказ остаётся оплаченным и идёт в печать обычным путём (статус «Оплачен» → «В печати»); лишнее — переплата
   *   к возврату или решению в «Финансах»;
   * - не хватает — заказ снова ждёт оплаты остатка (выручка — когда деньги покроют новую сумму): в печать — только после
   *   оплаты или явной постоплаты, как любой печатный заказ.
   */
  upgradeToPrinted(input: { plan: PlanId; discount: Discount | null; planName: (id: PlanId) => string }, actor: string, now: Date): { due: number; credited: number; outstanding: number; overpaid: number } {
    if (this.props.status === "cancelled") throw new OrderingError("paymentRule", "Заказ отменён: оформите новый заказ");
    if (this.isPrinted) throw new OrderingError("paymentRule", "Заказ уже на печатную книгу");
    if (!this.props.paidAt) throw new OrderingError("paymentRule", "Электронная версия ещё не оплачена: смените тариф в «Условиях», и клиент оплатит сразу печатную");
    if (this.props.status !== "paid") throw new OrderingError("paymentRule", "Перевести в печатную можно заказ в статусе «Оплачен»");
    const plan = getPlan(input.plan);
    if (!plan?.printed) throw new OrderingError("paymentRule", "Выберите печатный тариф");
    const before = this.props.price;
    const prepaid = before.prepaidAmount ?? 0;
    // Как changeTerms без договорённой цены: прайс тарифа, внесённая по сделке предоплата — авансом.
    const agreement: Agreement | null = prepaid > 0 ? { agreedTotal: Number.POSITIVE_INFINITY, prepaid } : null;
    const price = calculatePrice(plan.id, 1, this.props.delivery.method, input.discount, before.addons, agreement);
    // Денег не хватает — не переводим: иначе оплаченная электронная книга снова «ждёт оплату» (клиент теряет доступ к
    // файлам, а страница оплаты просит полную цену). Сначала доплату принимают в «Оплате» заказа, потом переводят.
    const short = price.amount - this.props.receivedAmount;
    if (short > 0) throw new OrderingError("paymentRule", `Не хватает ${formatPrice(short)}: сначала примите доплату в «Оплате» заказа, потом переведите в печатную`);
    const planBefore = this.props.plan;
    this.props.plan = plan.id;
    if (plan.id !== planBefore) this.syncLayoutRequirement();
    this.props.quantity = 1;
    this.props.price = price;
    const received = this.props.receivedAmount;
    const credited = Math.max(0, Math.min(received, price.amount));
    const outstanding = Math.max(0, price.amount - received);
    const overpaid = Math.max(0, received - price.amount);
    this.log(null, `${input.planName(planBefore)} → ${input.planName(plan.id)}, зачтено ${formatPrice(credited)}, к доплате ${formatPrice(outstanding)}${prepaid > 0 ? ` (предоплата по сделке ${formatPrice(price.prepaidAmount ?? 0)} учтена)` : ""}${overpaid > 0 ? `; переплата ${formatPrice(overpaid)} — к возврату` : ""}`, actor, now);
    this.record(OrderingEvents.orderRepriced({ ...this.ref(), previousAmount: before.amount, previousPlan: planBefore, actor }));
    return { due: price.amount, credited, outstanding, overpaid };
  }

  /**
   * Покупатель согласовал макет: запоминаем отпечаток книги, какой она сейчас. Повтор с той же версией — без записи (false).
   * Нельзя, пока книга открыта для правок, и у заказа без согласования (электронный, отправлен, отменён).
   */
  approveLayout(current: CurrentLayout, now: Date): boolean {
    const refusal = layoutApprovalRefusal({ status: this.props.status, layoutApproval: this.props.layoutApproval }, current);
    if (refusal) throw new OrderingError(refusal);
    const a = this.props.layoutApproval;
    if (a.approvedAt && a.fingerprint === current.fingerprint) return false;
    const again = !!a.approvedAt || !!a.revokedAt;
    this.props.layoutApproval = { required: true, approvedAt: now, fingerprint: current.fingerprint, revokedAt: null };
    this.log(null, `Клиент согласовал макет${again ? " повторно" : ""} (версия ${current.fingerprint}): книга уйдёт в печать как есть`, "customer", now);
    this.record(OrderingEvents.layoutApproved({ ...this.ref(), fingerprint: current.fingerprint!, again }));
    return true;
  }

  /**
   * Согласие клиента больше не действует — книгу открыли для правок: печатные файлы закрыты, пока клиент не согласует
   * заново (даже если ничего не поменяет).
   */
  revokeLayoutApproval(actor: string, now: Date) {
    const a = this.props.layoutApproval;
    // Не согласовывали — сбрасывать нечего: макет и так ждёт согласования.
    if (!a.required || !a.approvedAt) return;
    this.props.layoutApproval = { ...a, approvedAt: null, fingerprint: null, revokedAt: now };
    this.log(null, "Согласование макета сброшено: книга открыта для правок — клиент должен согласовать заново", actor, now);
  }

  /** Печать без согласования клиента (или изменённой после него книги) — отказ с тем же текстом, что у файлов. */
  private assertLayoutForPrint(current: CurrentLayout | null) {
    const block = layoutBlock(this.props.layoutApproval, current);
    if (block) throw new OrderingError(block);
  }

  /** Тариф сменился: печатному заказу до печати нужно согласование, электронному — нет. */
  private syncLayoutRequirement() {
    this.props.layoutApproval = { ...this.props.layoutApproval, required: layoutApprovalRequired(this.isPrinted, this.props.status) };
  }

  recordPrintSpec(spec: OrderPrintSpec) {
    const first = !this.props.printSpec;
    this.props.printSpec = spec;
    if (first) this.record(OrderingEvents.printFilesReady({ ...this.ref(), pageCount: spec.pageCount }));
  }

  private log(status: OrderStatus | null, note: string, actor: string, at: Date) {
    this.#newHistory.push({ status, note, actor, at });
  }
}
