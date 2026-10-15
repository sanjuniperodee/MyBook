import { systemActor, type Clock, type Logger, type UnitOfWork } from "@/shared/application";
import {
  kaspiOutcome,
  kaspiPhone,
  OrderingError,
  PaymentInvoice,
  type GiftCardRepository,
  type KaspiMethod,
  type KaspiOutcome,
  type KaspiPaymentView,
  type KaspiWebhook,
  type OrderRepository,
  type PaymentInvoiceRepository,
  type PaymentTarget,
} from "../domain";
import type { GiftsService } from "./GiftsService";
import type { OrdersService } from "./OrdersService";
import type { KaspiGateway } from "./ports";

/** Кто спрашивает о счёте: владелец заказа или держатель ссылки на сертификат. */
export type InvoiceOwner = { userId: string } | { giftToken: string };

/** Не чаще раза в столько спрашиваем Kaspi о счёте, когда клиент ждёт на странице. */
const REFRESH_EVERY_MS = 3_000;
/** Уведомление без подписи — повод сверить счёт, но не чаще раза в столько. */
const NUDGE_EVERY_MS = 1_000;

/**
 * Оплата через Kaspi Pay: счёт в приложение Kaspi по номеру телефона или QR-код. Оплату подтверждает
 * вебхук kaspi-pos-automation, а если он не дошёл — сверка статуса (страница клиента и фоновый проход).
 * Ручная смена статуса сотрудником остаётся запасным путём.
 */
export class KaspiPaymentsService {
  constructor(
    private readonly invoices: PaymentInvoiceRepository,
    private readonly orders: OrderRepository,
    private readonly gifts: GiftCardRepository,
    private readonly ordersService: OrdersService,
    private readonly giftsService: GiftsService,
    private readonly kaspi: KaspiGateway,
    /** Оплата через Kaspi включена в «Интеграциях». */
    private readonly enabled: () => Promise<boolean>,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  /** Показывать ли клиенту оплату через Kaspi: включена и кассир подключён. */
  async available(): Promise<boolean> {
    if (!(await this.enabled())) return false;
    return this.kaspi.connected().catch(() => false);
  }

  async payOrder(orderId: string, userId: string, input: { method: KaspiMethod; phone?: string | null }) {
    const order = await this.orders.findOwned(orderId, userId);
    if (!order) throw new OrderingError("orderNotFound");
    if (order.status !== "pending_payment" || order.isFree) throw new OrderingError("notPayable");
    return this.issue({ kind: "order", id: order.id }, order.amount, `MyBooks №${order.number}`, input);
  }

  async payGift(token: string, input: { method: KaspiMethod; phone?: string | null }) {
    const gift = await this.gifts.findByToken(token);
    if (!gift) throw new OrderingError("giftNotFound");
    if (gift.status !== "pending_payment") throw new OrderingError("notPayable");
    return this.issue({ kind: "gift", id: gift.id }, gift.amount, `MyBooks G${gift.number}`, input);
  }

  /** Текущий счёт для страницы оплаты: ждущий или только что оплаченный (истёкший и отменённый — уже не нужен). */
  async current(target: PaymentTarget): Promise<PaymentInvoice | null> {
    const invoice = await this.invoices.latestFor(target);
    return invoice && (invoice.status === "paid" || invoice.isOpen(this.clock.now())) ? invoice : null;
  }

  /** Счёт для страницы оплаты; ждущий счёт заодно сверяется с Kaspi (не чаще раза в 3 секунды). */
  async status(invoiceId: string, owner: InvoiceOwner): Promise<PaymentInvoice> {
    const invoice = await this.owned(invoiceId, owner);
    if (invoice.status !== "pending" || this.clock.now().getTime() - invoice.updatedAt.getTime() < REFRESH_EVERY_MS) return invoice;
    await this.refresh(invoice).catch((err) => this.logger.warn("сверка счёта не удалась", { invoiceId, error: String(err) }));
    return (await this.invoices.findById(invoiceId)) ?? invoice;
  }

  /** Клиент передумал: счёт в Kaspi отменяется (QR отменить нельзя — он просто истечёт). */
  async cancel(invoiceId: string, owner: InvoiceOwner): Promise<void> {
    const invoice = await this.owned(invoiceId, owner);
    await this.close(invoice);
  }

  /** Заказ отменён: открытые счета по нему закрываем, чтобы клиент не оплатил отменённое. */
  async cancelOpenFor(target: PaymentTarget): Promise<void> {
    const invoice = await this.invoices.latestFor(target);
    if (invoice?.isOpen(this.clock.now())) await this.close(invoice);
  }

  /**
   * Вебхук kaspi-pos-automation. С верной подписью событие применяется как есть. Без неё (секрет в webhooks.json сервиса
   * не задан) уведомлению не верим, а сверяем счёт с Kaspi сами — так вебхук работает без общего секрета.
   * unknown — не наш счёт.
   */
  async onWebhook(hook: KaspiWebhook, signed: boolean): Promise<"ok" | "unknown"> {
    const invoice = await this.invoices.findByExternalId("kaspi", hook.externalId);
    if (!invoice) return "unknown";
    if (signed && hook.event !== "payment.lost") await this.settle(invoice.id, webhookOutcome(hook), hook.status, hook.amount);
    // «Статус потерян» (сессия кассира вытеснена) или уведомление без подписи: спрашиваем Kaspi сами.
    else if (signed || this.clock.now().getTime() - invoice.updatedAt.getTime() >= NUDGE_EVERY_MS) await this.refresh(invoice);
    return "ok";
  }

  /**
   * Сверка с Kaspi счетов, созданных за последние windowMs: проводит оплаты, о которых не дошёл вебхук
   * (в том числе подтверждённые после того, как мы закрыли счёт по сроку), и закрывает истёкшие.
   */
  async reconcile(windowMs: number, limit = 200): Promise<{ checked: number; paid: number }> {
    const now = this.clock.now();
    const due = await this.invoices.toReconcile(new Date(now.getTime() - windowMs), limit);
    let paid = 0;
    for (const invoice of due) {
      try {
        if (await this.refresh(invoice)) paid++;
        const fresh = await this.invoices.findById(invoice.id);
        if (fresh?.status === "pending" && !fresh.isOpen(this.clock.now())) await this.expire(fresh.id);
      } catch (err) {
        this.logger.warn("сверка счёта Kaspi не удалась", { invoiceId: invoice.id, error: String(err) });
      }
    }
    return { checked: due.length, paid };
  }

  // ─── внутреннее ──────────────────────────────────────────────────────────

  private async issue(target: PaymentTarget, amount: number, comment: string, input: { method: KaspiMethod; phone?: string | null }): Promise<PaymentInvoice> {
    const phone = input.method === "invoice" ? kaspiPhone(input.phone) : null;
    if (input.method === "invoice" && !phone) throw new OrderingError("phoneInvalid");
    if (!(await this.available())) throw new OrderingError("kaspiNotConnected");
    const now = this.clock.now();
    const last = await this.invoices.latestFor(target);
    if (last?.isOpen(now)) {
      // Повторное нажатие — тот же счёт. Другой способ или номер — прежний счёт отменяем, чтобы не оплатили дважды.
      if (last.method === input.method && last.phone === phone && last.amount === amount) return last;
      await this.close(last);
    }
    const view = input.method === "invoice" ? await this.kaspi.createInvoice(phone!, amount, comment) : await this.kaspi.createQr(amount);
    const invoice = PaymentInvoice.issue(
      this.invoices.nextId(),
      { provider: "kaspi", target, method: input.method, externalId: view.externalId, phone, amount, checkoutUrl: view.checkoutUrl, qrToken: view.qrToken, expiresAt: view.expiresAt, providerStatus: view.status || null },
      now,
    );
    await this.invoices.add(invoice);
    return invoice;
  }

  private async owned(invoiceId: string, owner: InvoiceOwner): Promise<PaymentInvoice> {
    const invoice = await this.invoices.findById(invoiceId);
    if (!invoice) throw new OrderingError("invoiceNotFound");
    const { target } = invoice;
    const allowed =
      target.kind === "order"
        ? "userId" in owner && !!(await this.orders.findOwned(target.id, owner.userId))
        : "giftToken" in owner && (await this.gifts.findById(target.id))?.token === owner.giftToken;
    if (!allowed) throw new OrderingError("invoiceNotFound");
    return invoice;
  }

  /** Спросить Kaspi о счёте и применить ответ. true — счёт стал оплаченным. */
  private async refresh(invoice: PaymentInvoice): Promise<boolean> {
    const view = await this.kaspi.details(invoice.externalId, invoice.method);
    if (!view) return false;
    return this.settle(invoice.id, kaspiOutcome(view.status), view.status, view.amount, view);
  }

  /** Новый статус счёта и, если он оплачен, подтверждение заказа или сертификата — в одной транзакции. */
  private async settle(invoiceId: string, outcome: KaspiOutcome, providerStatus: string, amount: number | null, details?: KaspiPaymentView): Promise<boolean> {
    return this.uow.run(async () => {
      const invoice = await this.invoices.lockById(invoiceId);
      if (!invoice) return false;
      const now = this.clock.now();
      if (details) invoice.refreshDetails(details, now);
      if (outcome === "paid" && !invoice.matchesAmount(amount)) {
        // Сумма не сходится — платёж не засчитываем, разбирается сотрудник.
        this.logger.error("сумма оплаты Kaspi не совпадает со счётом", undefined, { invoiceId, expected: invoice.amount, got: amount });
        invoice.apply("failed", `AmountMismatch:${amount}`, now);
        await this.invoices.save(invoice);
        return false;
      }
      const paid = invoice.apply(outcome, providerStatus, now);
      await this.invoices.save(invoice);
      if (paid) await this.confirmTarget(invoice);
      return paid;
    });
  }

  private async confirmTarget(invoice: PaymentInvoice) {
    const actor = systemActor("kaspi");
    const paymentId = `kaspi:${invoice.externalId}`;
    const { target } = invoice;
    if (target.kind === "gift") {
      const gift = await this.gifts.findById(target.id);
      if (gift?.status === "pending_payment") await this.giftsService.confirmPayment(gift.id, paymentId, actor);
      else this.logger.warn("оплата Kaspi пришла по уже закрытому сертификату — нужен возврат", { giftId: target.id, externalId: invoice.externalId });
      return;
    }
    // Клиент оплатил второй счёт или отменённый заказ: деньги пришли, заказ не трогаем — сотрудник делает возврат.
    await this.ordersService.acceptProviderPayment({ orderId: target.id, paymentId, provider: "Kaspi", operationId: invoice.externalId, amount: invoice.amount }, actor);
  }

  private async close(invoice: PaymentInvoice) {
    if (invoice.method === "invoice") await this.kaspi.cancel(invoice.externalId).catch((err) => this.logger.warn("не удалось отменить счёт в Kaspi", { externalId: invoice.externalId, error: String(err) }));
    await this.uow.run(async () => {
      const fresh = await this.invoices.lockById(invoice.id);
      if (!fresh) return;
      fresh.cancel(this.clock.now());
      await this.invoices.save(fresh);
    });
  }

  private async expire(invoiceId: string) {
    await this.uow.run(async () => {
      const fresh = await this.invoices.lockById(invoiceId);
      if (!fresh) return;
      fresh.expire(this.clock.now());
      await this.invoices.save(fresh);
    });
  }
}

function webhookOutcome(hook: KaspiWebhook): KaspiOutcome {
  if (hook.event === "payment.success") return "paid";
  if (hook.event === "payment.expired") return "expired";
  return kaspiOutcome(hook.status) === "cancelled" ? "cancelled" : "failed";
}
