import type { Actor, Clock, UnitOfWork } from "@/shared/application";
import { NotFoundError } from "@/shared/domain";
import type { DeliveryId, PlanId } from "@/config/site";
import { formatPrice, getPlan } from "@/config/site";
import type { Locale } from "@/i18n/config";
import { Order, OrderingError, type OrderContact, type OrderDelivery, type OrderRepository, type OrderStatus, type PromoCodeRepository } from "../domain";
import type { AgreementGateway, BookGateway, PaymentSettings, PeopleGateway, PrintFiles } from "./ports";

export interface PlaceOrderCommand {
  userId: string;
  userPhone: string | null;
  locale: Locale;
  bookId: string;
  plan: PlanId;
  quantity: number;
  delivery: OrderDelivery & { method: DeliveryId | null };
  addons: string[];
  contact: OrderContact;
  promoCode?: string;
  customerComment?: string;
  giftNote?: string;
  desiredDate?: string;
  surprise?: boolean;
  /**
   * Что делать с договорённостью по ручной сделке (если она есть): agreed — договорённая цена и предоплата в зачёт (по умолчанию);
   * advance — обычная цена по каталогу, предоплата засчитывается как аванс (заказ «с нуля»: другой тариф, другая книга).
   */
  agreementMode?: "agreed" | "advance";
  /** Печатная версия к уже оплаченной электронной (заказ клиента): та оплата засчитывается, книга остаётся закрытой для правок. */
  upgradeFromOrderId?: string;
}

/** Можно ли дозаказать печатную книгу к оплаченной электронной и сколько уже оплачено (зачёт). */
export interface UpgradeOffer {
  orderId: string;
  number: number;
  bookId: string;
  /** Сколько клиент заплатил за электронную версию (₸), будет вычтено из печатной. */
  credit: number;
}

export interface UpdateOrderCommand {
  orderId: string;
  status: OrderStatus;
  trackingNumber?: string;
  note?: string;
}

/**
 * Сценарии жизненного цикла заказа. Каждая команда — одна транзакция; события агрегата
 * (оплачен, отменён…) публикуются после фиксации, и на них реагируют письма, CRM, производство.
 */
export class OrdersService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly promos: PromoCodeRepository,
    private readonly books: BookGateway,
    private readonly people: PeopleGateway,
    private readonly printFiles: PrintFiles,
    private readonly payments: PaymentSettings,
    private readonly agreements: AgreementGateway,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  /** Договорённая цена и предоплата клиента по ручной сделке (для страницы оформления и расчёта заказа). */
  agreementFor(userId: string) {
    return this.agreements.agreementFor(userId);
  }

  /**
   * Предложение «заказать печатную книгу»: у клиента оплаченный заказ электронной версии (его заказ, не отменён), по этой книге нет других
   * живых заказов — значит, печатный ещё не заказан. Оплата электронной версии засчитывается в печатную.
   */
  async upgradeOffer(orderId: string, userId: string): Promise<UpgradeOffer | null> {
    const digital = await this.orders.findOwned(orderId, userId);
    if (!digital || digital.isPrinted || digital.status !== "paid") return null;
    if (await this.orders.hasOtherActiveOrders(digital.bookId, digital.id)) return null;
    const price = digital.snapshot().price;
    return { orderId: digital.id, number: digital.number, bookId: digital.bookId, credit: price.amount + (price.prepaidAmount ?? 0) };
  }

  async place(cmd: PlaceOrderCommand): Promise<Order> {
    const book = await this.books.checkoutInfo(cmd.bookId, cmd.userId, cmd.locale);
    if (!book) throw new OrderingError("bookNotFound");
    const upgrade = cmd.upgradeFromOrderId ? await this.upgradeOffer(cmd.upgradeFromOrderId, cmd.userId) : null;
    if (cmd.upgradeFromOrderId && (!upgrade || upgrade.bookId !== cmd.bookId || !getPlan(cmd.plan)?.printed)) throw new OrderingError("upgradeUnavailable");
    if (book.status !== "draft" && !upgrade) throw new OrderingError("alreadyOrdered");
    if (book.blockingIssue) throw new OrderingError("notReady", book.blockingIssue);

    const now = this.clock.now();
    const promo = cmd.promoCode ? await this.promos.findByCode(cmd.promoCode) : null;
    if (cmd.promoCode && !promo) throw new OrderingError("notFound");
    promo?.assertUsable(now, promo && { userId: cmd.userId, hasPaidOrders: promo.firstOrderOnly && (await this.orders.hasPaidOrders(cmd.userId)) });

    // Дозаказ печатной версии к электронной: оплата электронной засчитывается как аванс; договорённость менеджера не применяется.
    const found = upgrade ? null : await this.agreements.agreementFor(cmd.userId);
    // «Аванс»: цену по договорённости не применяем (потолок бесконечен), но уже внесённые деньги вычитаем из «к оплате».
    const agreedMode = !!found && cmd.agreementMode !== "advance";
    const agreedPlan = found?.plan && getPlan(found.plan) ? (found.plan as PlanId) : null;
    // По договорённости тариф фиксирован (даже если форму подменили); «с нуля» — клиент выбирает любой.
    const plan = agreedMode && agreedPlan ? agreedPlan : cmd.plan;
    const agreement = upgrade ? { agreedTotal: Number.POSITIVE_INFINITY, prepaid: upgrade.credit } : found && { agreedTotal: agreedMode ? found.agreedTotal : Number.POSITIVE_INFINITY, prepaid: found.prepaid };
    const identity = await this.orders.nextIdentity();
    const order = Order.place(
      {
        ...identity,
        agreement,
        credit: upgrade ? { orderNumber: upgrade.number, amount: upgrade.credit } : null,
        userId: cmd.userId,
        bookId: cmd.bookId,
        plan,
        quantity: cmd.quantity,
        delivery: cmd.delivery,
        addons: cmd.addons,
        contact: cmd.contact,
        promo,
        currency: this.payments.currency(),
        paymentProvider: this.payments.provider(),
        customerComment: cmd.customerComment,
        giftNote: cmd.giftNote,
        desiredDate: cmd.desiredDate,
        surprise: cmd.surprise,
        estimatedPages: book.estimatedPages,
        formatMoney: formatPrice,
      },
      now,
    );

    await this.uow.run(async () => {
      if (promo && !(await this.promos.tryReserve(promo.id, now))) throw new OrderingError("promoGone");
      // Дозаказ печатной версии: книга уже закрыта электронным заказом — блокировать нечего.
      if (!(upgrade && book.status === "ordered") && !(await this.books.lockForOrder(cmd.bookId))) throw new OrderingError("alreadyOrdered");
      await this.orders.add(order);
      if (!cmd.userPhone) await this.people.rememberPhoneIfMissing(cmd.userId, cmd.contact.phone);
      this.uow.track(order);
    });

    // Заказ полностью оплачен промокодом, сертификатом или предоплатой по договорённости — сразу передаём в работу.
    if (order.isFree) await this.confirmPayment({ orderId: order.id, paymentId: promo?.code ?? (found ? `prepaid:${found.dealNumber}` : null) }, { label: found && !promo ? "prepaid" : "promo" });
    return order;
  }

  /** Оплата подтверждена (платёжная система или сотрудник). Повтор безопасен. */
  async confirmPayment(cmd: { orderId: string; paymentId: string | null }, actor: Actor): Promise<Order> {
    return this.mutate(cmd.orderId, (order, now) => order.markPaid(cmd.paymentId, actor.label, now));
  }

  async changeStatus(cmd: { orderId: string; to: OrderStatus; note?: string }, actor: Actor): Promise<Order> {
    return this.mutate(cmd.orderId, async (order, now) => {
      const r = order.changeStatus(cmd.to, actor.label, cmd.note ?? "", now);
      if (r.cancelled) await this.afterCancel(order, r.releasePromo);
    });
  }

  /** Форма заказа в CRM: трек-номер, статус и комментарий одним действием. */
  async update(cmd: UpdateOrderCommand, actor: Actor): Promise<Order> {
    return this.mutate(cmd.orderId, async (order, now) => {
      if (cmd.trackingNumber !== undefined) order.setTrackingNumber(cmd.trackingNumber);
      const r = order.changeStatus(cmd.status, actor.label, cmd.note ?? "", now);
      if (r.cancelled) await this.afterCancel(order, r.releasePromo);
    });
  }

  async cancelByCustomer(orderId: string, userId: string): Promise<void> {
    await this.uow.run(async () => {
      const order = await this.orders.findOwned(orderId, userId);
      if (!order) throw new NotFoundError("order", orderId);
      if (order.status !== "pending_payment") return;
      const { releasePromo } = order.cancelByCustomer(this.clock.now());
      await this.afterCancel(order, releasePromo);
      await this.orders.save(order);
      this.uow.track(order);
    });
  }

  async claimPayment(orderId: string, userId: string): Promise<void> {
    await this.uow.run(async () => {
      const order = await this.orders.findOwned(orderId, userId);
      if (!order) throw new NotFoundError("order", orderId);
      if (!order.claimPayment(this.clock.now())) return;
      await this.orders.save(order);
      this.uow.track(order);
    });
  }

  async recordPaymentFailure(orderId: string, reason: string, actor: Actor) {
    return this.mutate(orderId, (order, now) => order.recordPaymentFailure(reason, actor.label, now));
  }

  async addNote(orderId: string, note: string, actor: Actor) {
    return this.mutate(orderId, (order, now) => order.addNote(note, actor.label, now));
  }

  async saveAdminNote(orderId: string, note: string) {
    return this.mutate(orderId, (order) => order.setAdminNote(note));
  }

  async assign(orderId: string, assigneeId: string | null, actor: Actor) {
    const label = assigneeId ? await this.people.assigneeLabel(assigneeId) : null;
    if (assigneeId && !label) throw new OrderingError("staffNotFound", "Ответственным может быть только сотрудник CRM");
    return this.mutate(orderId, (order, now) => order.assign(assigneeId, label ?? "", actor.label, now));
  }

  async updateDetails(cmd: { orderId: string; contact: OrderContact; delivery: OrderDelivery; desiredDate: string | null; giftNote: string | null }, actor: Actor) {
    return this.mutate(cmd.orderId, (order, now) => order.updateDetails(cmd.contact, cmd.delivery, { desiredDate: cmd.desiredDate, giftNote: cmd.giftNote }, actor.label, now));
  }

  async toggleBookEditing(orderId: string, actor: Actor) {
    return this.mutate(orderId, async (order, now) => {
      const next = await this.books.toggleEditing(order.bookId);
      order.addNote(next === "draft" ? "Книга открыта для правок" : "Книга снова закрыта для правок", actor.label, now);
    });
  }

  async regeneratePrintFiles(orderId: string, actor: Actor) {
    const current = await this.orders.findById(orderId);
    if (!current) throw new OrderingError("orderNotFound");
    const spec = await this.printFiles.prepare({ orderId, bookId: current.bookId, number: current.number }, { force: true });
    return this.mutate(orderId, (order, now) => {
      if (spec) order.recordPrintSpec(spec);
      order.addNote("Файлы для печати сгенерированы", actor.label, now);
    });
  }

  /** Сохранить параметры печати, посчитанные производством. */
  async recordPrintSpec(orderId: string, spec: NonNullable<Awaited<ReturnType<PrintFiles["prepare"]>>>) {
    return this.mutate(orderId, (order) => order.recordPrintSpec(spec));
  }

  async findByNumber(number: number) {
    return this.orders.findByNumber(number);
  }

  // ─── внутреннее ──────────────────────────────────────────────────────────

  private async mutate(orderId: string, change: (order: Order, now: Date) => unknown): Promise<Order> {
    return this.uow.run(async () => {
      const order = await this.orders.findById(orderId);
      if (!order) throw new OrderingError("orderNotFound");
      await change(order, this.clock.now());
      await this.orders.save(order);
      this.uow.track(order);
      return order;
    });
  }

  /** Отмена в той же транзакции: вернуть промокод, открыть книгу, если других живых заказов нет. */
  private async afterCancel(order: Order, releasePromo: boolean) {
    if (releasePromo && order.promoCode) await this.promos.release(order.promoCode);
    if (!(await this.orders.hasOtherActiveOrders(order.bookId, order.id))) await this.books.unlock(order.bookId);
  }
}
