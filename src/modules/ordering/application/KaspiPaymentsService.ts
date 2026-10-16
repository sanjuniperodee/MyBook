import { systemActor, type Clock, type Logger, type UnitOfWork } from "@/shared/application";
import {
  kaspiOutcome,
  kaspiPhone,
  OrderingError,
  payComment,
  PaymentInvoice,
  type DealInvoice,
  type DealInvoiceRepository,
  type GiftCardRepository,
  type KaspiMethod,
  type KaspiOutcome,
  type KaspiPaymentView,
  type KaspiWebhook,
  type OrderRepository,
  type PaymentInvoiceRepository,
  type PaymentTarget,
} from "../domain";
import type { DealInvoicesService, InvoiceSales } from "./DealInvoicesService";
import type { GiftsService } from "./GiftsService";
import type { OrdersService } from "./OrdersService";
import type { KaspiGateway } from "./ports";

/** Кто спрашивает о счёте: владелец заказа, держатель ссылки на сертификат или на счёт из чата (/pay/<token>). */
export type InvoiceOwner = { userId: string } | { giftToken: string } | { dealInvoiceToken: string };

/** Счета из чата по сделкам: хранилище, подтверждение оплаты по операции и сделка (есть ли по ней заказ). */
export interface KaspiDealInvoices {
  repo: Pick<DealInvoiceRepository, "findById" | "findByToken" | "lockById">;
  service: Pick<DealInvoicesService, "confirmOnline">;
  sales: Pick<InvoiceSales, "deal">;
}

/** Не чаще раза в столько спрашиваем Kaspi о счёте, когда клиент ждёт на странице. */
const REFRESH_EVERY_MS = 3_000;
/** Уведомление без подписи — повод сверить счёт, но не чаще раза в столько. */
const NUDGE_EVERY_MS = 1_000;

/** Ответ Kaspi о попытке, уже применённый к ней: итог и стала ли она оплаченной сейчас. */
type Answer = { outcome: KaspiOutcome; paid: boolean };

const dealTarget = (invoice: DealInvoice): PaymentTarget => ({ kind: "deal_invoice", id: invoice.id });
const dealComment = (invoice: DealInvoice) => payComment(invoice.label);

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
    /** Счета из чата (цель deal_invoice); не подключены — такие попытки оплаты считаются ошибкой. */
    private readonly dealInvoices: KaspiDealInvoices | null = null,
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

  /**
   * Оплата счёта из чата по ссылке /pay/<token>: сумма — сумма счёта, комментарий «MyBooks P<n>». Номер для счёта
   * в Kaspi клиент может ввести свой; не ввёл — берём номер WhatsApp-чата из счёта (клиент видит его только с маской).
   */
  async payDealInvoice(token: string, input: { method: KaspiMethod; phone?: string | null }) {
    const invoice = await this.deals().repo.findByToken(token);
    if (!invoice) throw new OrderingError("invoiceNotFound");
    await this.assertPayable(invoice);
    const phone = input.method === "invoice" ? input.phone?.trim() || invoice.snapshot().phone : null;
    return this.issue(dealTarget(invoice), invoice.amount, dealComment(invoice), { method: input.method, phone });
  }

  /** Счёт Kaspi на номер клиента сразу при выпуске счёта из CRM (номер WhatsApp-чата подставляет сервер). */
  async pushDealInvoice(invoiceId: string, phone: string) {
    const invoice = await this.deals().repo.findById(invoiceId);
    if (!invoice) throw new OrderingError("invoiceNotFound");
    await this.assertPayable(invoice);
    return this.issue(dealTarget(invoice), invoice.amount, dealComment(invoice), { method: "invoice", phone });
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

  /** Заказ отменён (счёт из чата закрыт): открытые счета по нему закрываем, чтобы клиент не оплатил отменённое. */
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
    if (signed && hook.event !== "payment.lost") await this.settle(invoice, webhookOutcome(hook), hook.status, hook.amount);
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
        const answer = await this.ask(invoice);
        if (answer?.paid) paid++;
        // Попытку оплаты счёта из чата закрываем по сроку, только если Kaspi ответил о ней (подтвердил, что не оплачено).
        if (!answer && invoice.target.kind === "deal_invoice") continue;
        const fresh = await this.invoices.findById(invoice.id);
        if (fresh?.status === "pending" && !fresh.isOpen(this.clock.now())) await this.expire(fresh.id);
      } catch (err) {
        this.logger.warn("сверка счёта Kaspi не удалась", { invoiceId: invoice.id, error: String(err) });
      }
    }
    return { checked: due.length, paid };
  }

  /**
   * Долгая сверка счетов из чата (раз в 15 минут, весь срок счёта): попытки оплаты в Kaspi — ждущие, истёкшие и
   * отменённые за windowMs. Каждую сперва сверяем с Kaspi: оплата, пришедшая после закрытия, проводится (счёт из чата
   * решает, засчитать её или «нужен возврат»). Счёт из чата закрыт (отменён, истёк, оплачен другим способом, по сделке
   * заказ) — его ждущие попытки отменяются, но только если Kaspi подтвердил, что они не оплачены.
   */
  async reconcileDealInvoices(windowMs: number, limit = 200): Promise<{ checked: number; paid: number; closed: number }> {
    const due = await this.invoices.dealInvoiceAttempts(new Date(this.clock.now().getTime() - windowMs), limit);
    let paid = 0;
    let closed = 0;
    for (const attempt of due) {
      try {
        const answer = await this.ask(attempt);
        if (answer?.paid) paid++;
        // Kaspi не ответил о попытке — не трогаем её: она остаётся в сверке.
        if (!answer) continue;
        const fresh = await this.invoices.findById(attempt.id);
        if (fresh?.status !== "pending") continue;
        const invoice = await this.deals().repo.findById(fresh.target.id);
        if (!invoice || !(await this.payable(invoice))) {
          // Kaspi только что ответил, что попытка ждёт (не оплачена), — второй раз не спрашиваем.
          if ((await this.closeChecked(fresh, true)) === "closed") closed++;
        } else if (!fresh.isOpen(this.clock.now())) await this.expire(fresh.id);
      } catch (err) {
        this.logger.warn("сверка счёта Kaspi по счёту из чата не удалась", { invoiceId: attempt.id, error: String(err) });
      }
    }
    return { checked: due.length, paid, closed };
  }

  // ─── внутреннее ──────────────────────────────────────────────────────────

  private deals(): KaspiDealInvoices {
    if (!this.dealInvoices) throw new OrderingError("invoiceNotFound");
    return this.dealInvoices;
  }

  /** Счёт из чата можно оплатить: ждёт оплаты, не истёк, сделка есть и по ней ещё нет заказа. */
  private async payable(invoice: DealInvoice) {
    if (!invoice.isPayable(this.clock.now())) return false;
    const deal = await this.deals().sales.deal(invoice.dealId);
    return !!deal && !deal.orderId;
  }

  private async assertPayable(invoice: DealInvoice) {
    if (!(await this.payable(invoice))) throw new OrderingError("notPayable");
  }

  private async issue(target: PaymentTarget, amount: number, comment: string, input: { method: KaspiMethod; phone?: string | null }): Promise<PaymentInvoice> {
    const phone = input.method === "invoice" ? kaspiPhone(input.phone) : null;
    if (input.method === "invoice" && !phone) throw new OrderingError("phoneInvalid");
    if (!(await this.available())) throw new OrderingError("kaspiNotConnected");
    const now = this.clock.now();
    const last = await this.invoices.latestFor(target);
    if (last?.isOpen(now)) {
      // Повторное нажатие — тот же счёт. Другой способ или номер — прежний счёт отменяем, чтобы не оплатили дважды.
      if (last.method === input.method && last.phone === phone && last.amount === amount) return last;
      if (target.kind === "deal_invoice") {
        // Счёт из чата: прежнюю попытку — только после ответа Kaspi. Оплачена — новый счёт не нужен; Kaspi молчит —
        // второй счёт не выставляем (иначе клиент может оплатить оба).
        const closed = await this.closeChecked(last);
        if (closed === "paid") throw new OrderingError("notPayable");
        if (closed === "unknown") throw new OrderingError("kaspiUnavailable");
      } else await this.close(last);
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
    if (!(await this.ownedBy(invoice.target, owner))) throw new OrderingError("invoiceNotFound");
    return invoice;
  }

  /** Владелец попытки оплаты: заказ — его клиент, сертификат и счёт из чата — держатель секретной ссылки. */
  private async ownedBy(target: PaymentTarget, owner: InvoiceOwner): Promise<boolean> {
    switch (target.kind) {
      case "order":
        return "userId" in owner && !!(await this.orders.findOwned(target.id, owner.userId));
      case "gift":
        return "giftToken" in owner && (await this.gifts.findById(target.id))?.token === owner.giftToken;
      case "deal_invoice":
        return "dealInvoiceToken" in owner && (await this.deals().repo.findById(target.id))?.token === owner.dealInvoiceToken;
      default:
        return unknownTarget(target);
    }
  }

  /** Спросить Kaspi о счёте и применить ответ. true — счёт стал оплаченным. */
  private async refresh(invoice: PaymentInvoice): Promise<boolean> {
    return (await this.ask(invoice))?.paid ?? false;
  }

  /** Спросить Kaspi о попытке и применить ответ; null — Kaspi о ней ничего не сообщил. */
  private async ask(invoice: PaymentInvoice): Promise<Answer | null> {
    const view = await this.kaspi.details(invoice.externalId, invoice.method);
    if (!view) return null;
    const outcome = kaspiOutcome(view.status);
    return { outcome, paid: await this.settle(invoice, outcome, view.status, view.amount, view) };
  }

  /** Новый статус счёта и, если он оплачен, подтверждение заказа, сертификата или счёта из чата — в одной транзакции. */
  private async settle(attempt: PaymentInvoice, outcome: KaspiOutcome, providerStatus: string, amount: number | null, details?: KaspiPaymentView): Promise<boolean> {
    return this.uow.run(async () => {
      // Счёт из чата блокируется первым — один порядок для всех путей (deal_invoices → payment_invoices → crm_deals):
      // ручное подтверждение и CloudPayments тоже начинают со счёта, встречные транзакции не ждут друг друга по кругу.
      if (attempt.target.kind === "deal_invoice") await this.deals().repo.lockById(attempt.target.id);
      const invoice = await this.invoices.lockById(attempt.id);
      if (!invoice) return false;
      const now = this.clock.now();
      if (details) invoice.refreshDetails(details, now);
      if (outcome === "paid" && !invoice.matchesAmount(amount)) {
        // Сумма не сходится — платёж не засчитываем, разбирается сотрудник.
        this.logger.error("сумма оплаты Kaspi не совпадает со счётом", undefined, { invoiceId: invoice.id, target: invoice.target, expected: invoice.amount, got: amount });
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
    switch (target.kind) {
      case "gift": {
        const gift = await this.gifts.findById(target.id);
        if (gift?.status === "pending_payment") await this.giftsService.confirmPayment(gift.id, paymentId, actor);
        else this.logger.warn("оплата Kaspi пришла по уже закрытому сертификату — нужен возврат", { giftId: target.id, externalId: invoice.externalId });
        return;
      }
      case "order":
        // Клиент оплатил второй счёт или отменённый заказ: деньги пришли, заказ не трогаем — сотрудник делает возврат.
        await this.ordersService.acceptProviderPayment({ orderId: target.id, paymentId, provider: "Kaspi", operationId: invoice.externalId, amount: invoice.amount }, actor);
        return;
      case "deal_invoice": {
        // Ключ — операция Kaspi: повтор ничего не делает, оплата закрытого счёта — «нужен возврат или зачёт» (решает счёт).
        const result = await this.deals().service.confirmOnline({ invoiceId: target.id, method: "kaspi", ref: invoice.externalId, amount: invoice.amount });
        if (result === "unknown" || result === "mismatch") this.logger.error("оплата Kaspi по счёту из чата не засчитана", undefined, { dealInvoiceId: target.id, externalId: invoice.externalId, result });
        return;
      }
      default:
        unknownTarget(target);
    }
  }

  private async close(invoice: PaymentInvoice) {
    if (invoice.target.kind === "deal_invoice") {
      await this.closeChecked(invoice);
      return;
    }
    if (invoice.method === "invoice") await this.kaspi.cancel(invoice.externalId).catch((err) => this.logger.warn("не удалось отменить счёт в Kaspi", { externalId: invoice.externalId, error: String(err) }));
    await this.uow.run(async () => {
      const fresh = await this.invoices.lockById(invoice.id);
      if (!fresh) return;
      fresh.cancel(this.clock.now());
      await this.invoices.save(fresh);
    });
  }

  /**
   * Закрыть попытку оплаты счёта из чата: сначала спросить Kaspi и отменить только то, что Kaspi подтвердил
   * неоплаченным, — иначе оплата, прошедшая в эту секунду, потерялась бы. paid — попытка оказалась оплаченной;
   * unknown — Kaspi не ответил или не отменил счёт: попытка остаётся ждущей и в сверке. Сеть — вне транзакции.
   * asked — Kaspi уже спросили в этом проходе (и он ответил «не оплачено»).
   */
  private async closeChecked(attempt: PaymentInvoice, asked = false): Promise<"closed" | "paid" | "unknown"> {
    try {
      if (!asked && !(await this.ask(attempt))) return "unknown";
    } catch (err) {
      this.logger.warn("сверка счёта Kaspi перед отменой не удалась", { invoiceId: attempt.id, error: String(err) });
      return "unknown";
    }
    const fresh = await this.invoices.findById(attempt.id);
    if (!fresh) return "unknown";
    if (fresh.status === "paid") return "paid";
    // Kaspi сам закрыл попытку (отказ, отмена, истечение) — отменять нечего.
    if (fresh.status !== "pending") return "closed";
    if (fresh.method === "invoice") {
      try {
        await this.kaspi.cancel(fresh.externalId);
      } catch (err) {
        this.logger.warn("не удалось отменить счёт в Kaspi", { externalId: fresh.externalId, error: String(err) });
        return "unknown";
      }
    }
    // QR отменить в Kaspi нельзя: он истечёт сам, а поздняя оплата найдётся долгой сверкой (она смотрит и отменённые).
    const done = await this.uow.run(async () => {
      if (fresh.target.kind === "deal_invoice") await this.deals().repo.lockById(fresh.target.id);
      const locked = await this.invoices.lockById(fresh.id);
      if (!locked || locked.status !== "pending") return locked?.status === "paid" ? ("paid" as const) : ("closed" as const);
      locked.cancel(this.clock.now());
      await this.invoices.save(locked);
      return "closed" as const;
    });
    return done;
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

/** Цель оплаты, которой нет в PaymentTarget (испорченная строка в базе): ошибка, а не «как заказ». */
function unknownTarget(target: never): never {
  throw new OrderingError("paymentRule", `Неизвестная цель оплаты Kaspi: ${JSON.stringify(target)}`);
}

function webhookOutcome(hook: KaspiWebhook): KaspiOutcome {
  if (hook.event === "payment.success") return "paid";
  if (hook.event === "payment.expired") return "expired";
  return kaspiOutcome(hook.status) === "cancelled" ? "cancelled" : "failed";
}
