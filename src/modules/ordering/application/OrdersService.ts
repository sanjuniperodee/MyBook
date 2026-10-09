import type { Actor, Clock, UnitOfWork } from "@/shared/application";
import { NotFoundError } from "@/shared/domain";
import type { DeliveryId, PlanId } from "@/config/site";
import { formatPrice } from "@/config/site";
import type { Locale } from "@/i18n/config";
import { Order, OrderingError, type OrderContact, type OrderDelivery, type OrderRepository, type OrderStatus, type PromoCodeRepository } from "../domain";
import type { BookGateway, PaymentSettings, PeopleGateway, PrintFiles } from "./ports";

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
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async place(cmd: PlaceOrderCommand): Promise<Order> {
    const book = await this.books.checkoutInfo(cmd.bookId, cmd.userId, cmd.locale);
    if (!book) throw new OrderingError("bookNotFound");
    if (book.status !== "draft") throw new OrderingError("alreadyOrdered");
    if (book.blockingIssue) throw new OrderingError("notReady", book.blockingIssue);

    const now = this.clock.now();
    const promo = cmd.promoCode ? await this.promos.findByCode(cmd.promoCode) : null;
    if (cmd.promoCode && !promo) throw new OrderingError("notFound");
    promo?.assertUsable(now, promo && { userId: cmd.userId, hasPaidOrders: promo.firstOrderOnly && (await this.orders.hasPaidOrders(cmd.userId)) });

    const identity = await this.orders.nextIdentity();
    const order = Order.place(
      {
        ...identity,
        userId: cmd.userId,
        bookId: cmd.bookId,
        plan: cmd.plan,
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
      if (!(await this.books.lockForOrder(cmd.bookId))) throw new OrderingError("alreadyOrdered");
      await this.orders.add(order);
      if (!cmd.userPhone) await this.people.rememberPhoneIfMissing(cmd.userId, cmd.contact.phone);
      this.uow.track(order);
    });

    // Заказ полностью оплачен промокодом или сертификатом — сразу передаём в работу.
    if (order.isFree) await this.confirmPayment({ orderId: order.id, paymentId: promo?.code ?? null }, { label: "promo" });
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
    const label = assigneeId ? await this.people.staffLabel(assigneeId) : null;
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
