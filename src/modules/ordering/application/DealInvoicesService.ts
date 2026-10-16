import { randomBytes } from "node:crypto";
import type { Clock, UnitOfWork } from "@/shared/application";
import { getPlan } from "@/config/site";
import { DealInvoice, OrderingError, type DealInvoicePurpose, type DealInvoiceRepository } from "../domain";

/** Сделка глазами счёта (контекст «Продажи») — через порт, модули друг друга не импортируют. */
export interface InvoiceDeal {
  id: string;
  number: number;
  title: string;
  clientId: string | null;
  assigneeId: string | null;
  /** Цена книги по договорённости (сумма сделки). */
  amount: number;
  /** Принято денег (платежи минус возвраты). */
  paid: number;
  orderId: string | null;
  /** Сделка закрыта (успех или отказ). */
  closed: boolean;
}

export interface InvoiceSales {
  deal(dealId: string): Promise<InvoiceDeal | null>;
  /** Договорённость в сделку: тариф и цена книги (журнал сделки — у продаж). */
  setAgreement(dealId: string, input: { plan: string; agreedTotal: number; actorId: string }): Promise<void>;
  /** Онлайн-платёж по счёту: идемпотентно по операции; null — эта операция уже записана. */
  acceptOnline(input: { dealId: string; clientId: string | null; amount: number; paidAt: Date; method: "kaspi" | "cloudpayments"; externalRef: string; invoiceId: string; note: string }): Promise<{ paymentId: string } | null>;
}

export interface IssueInvoiceInput {
  dealId: string;
  conversationId: string | null;
  /** Номер WhatsApp-чата (цифры), если счёт выставлен из WhatsApp. */
  phone: string | null;
  clientName: string;
  locale: "ru" | "kk";
  channel: string;
  plan: string;
  agreedTotal: number;
  amount: number;
  purpose: DealInvoicePurpose;
  actor: { userId: string; label: string };
  /** Скидка от прайса тарифа сверх лимита менеджера — только руководителю. */
  maxDiscountPercent: number | null;
  /** Ключ формы: повторное нажатие (двойной клик, повтор запроса) возвращает уже выпущенный счёт. */
  issueKey?: string | null;
}

/** Сколько обрабатываем за проход планировщика. */
const BATCH = 50;

const newToken = () => randomBytes(32).toString("base64url");

/**
 * Счёт из чата: выпуск (один открытый на сделку, договорённость — в сделку), оплата по ссылке, подтверждение платёжной
 * системой или сотрудником, истечение. Деньги пишутся платежом сделки в той же транзакции, что и счёт: ключ
 * идемпотентности — операция платёжной системы, а не статус счёта (повторная оплата не теряется и не задваивается).
 */
export class DealInvoicesService {
  constructor(
    private readonly invoices: DealInvoiceRepository,
    private readonly sales: InvoiceSales,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  /** Выпуск счёта; repeated — тот же ключ формы уже выпустил счёт (сообщение клиенту повторно не отправлять). */
  async issue(input: IssueInvoiceInput): Promise<{ invoice: DealInvoice; repeated: boolean }> {
    const plan = getPlan(input.plan);
    if (!plan) throw new OrderingError("paymentRule", "Выберите тариф договорённости");
    if (!Number.isInteger(input.agreedTotal) || input.agreedTotal <= 0) throw new OrderingError("paymentRule", "Укажите цену книги по договорённости");
    // Заниженная цена — способ «левака»: скидка от прайса больше лимита менеджера — только руководитель.
    if (input.maxDiscountPercent !== null && input.agreedTotal < Math.round(plan.price * (1 - input.maxDiscountPercent / 100)))
      throw new OrderingError("paymentRule", `Цена ниже прайса больше чем на ${input.maxDiscountPercent}% — согласуйте с руководителем`);
    return this.uow.run(async () => {
      await this.invoices.lockDeal(input.dealId);
      const repeated = input.issueKey ? await this.invoices.findByIssueKey(input.issueKey) : null;
      if (repeated) {
        if (repeated.dealId !== input.dealId) throw new OrderingError("paymentRule", "Форма счёта устарела — откройте её заново");
        return { invoice: repeated, repeated: true };
      }
      const deal = await this.sales.deal(input.dealId);
      if (!deal) throw new OrderingError("paymentRule", "Сделка не найдена");
      if (deal.orderId) throw new OrderingError("paymentRule", "По сделке уже оформлен заказ — оплата идёт в заказе");
      if (deal.closed) throw new OrderingError("paymentRule", "Сделка закрыта — верните её в работу, чтобы выставить счёт");
      const left = input.agreedTotal - deal.paid;
      if (left <= 0) throw new OrderingError("paymentRule", "По договорённости уже всё оплачено");
      if (!Number.isInteger(input.amount) || input.amount <= 0 || input.amount > left) throw new OrderingError("paymentRule", `Сумма счёта — от 1 до ${left.toLocaleString("ru-RU")} ₸ (остаток по договорённости)`);
      // Один открытый счёт на сделку: прежний закрываем (в транзакции, под блокировкой сделки).
      const prev = await this.invoices.openFor(deal.id);
      if (prev?.cancel(`выставлен новый счёт`)) await this.invoices.save(prev);
      await this.sales.setAgreement(deal.id, { plan: input.plan, agreedTotal: input.agreedTotal, actorId: input.actor.userId });
      const { id, number } = await this.invoices.nextIdentity();
      const invoice = DealInvoice.issue(
        id,
        {
          number,
          token: newToken(),
          dealId: deal.id,
          conversationId: input.conversationId,
          phone: input.phone,
          clientName: input.clientName.trim().slice(0, 100),
          locale: input.locale,
          channel: input.channel,
          plan: input.plan,
          agreedTotal: input.agreedTotal,
          amount: input.amount,
          purpose: input.purpose,
          issuedById: input.actor.userId,
          issueKey: input.issueKey ?? null,
        },
        this.clock.now(),
      );
      await this.invoices.add(invoice);
      this.uow.track(invoice);
      return { invoice, repeated: false };
    });
  }

  byToken(token: string) {
    return this.invoices.findByToken(token);
  }

  byId(id: string) {
    return this.invoices.findById(id);
  }

  listFor(dealId: string) {
    return this.invoices.listFor(dealId);
  }

  async cancel(invoiceId: string, reason: string) {
    return this.uow.run(async () => {
      const invoice = await this.invoices.lockById(invoiceId);
      if (!invoice || !invoice.cancel(reason)) return null;
      await this.invoices.save(invoice);
      return invoice;
    });
  }

  /** Открытые счета сделки закрываются: оформлен заказ, сделка закрыта, слита или отклонена. */
  async cancelOpenFor(dealId: string, reason: string) {
    const open = await this.invoices.openFor(dealId);
    return open ? this.cancel(open.id, reason) : null;
  }

  /** Клиент сообщил, что оплатил переводом: ответственному — проверить поступление. */
  async claim(token: string) {
    return this.uow.run(async () => {
      const found = await this.invoices.findByToken(token);
      const invoice = found && (await this.invoices.lockById(found.id));
      if (!invoice || !invoice.claim(this.clock.now())) return invoice;
      await this.invoices.save(invoice);
      this.uow.track(invoice);
      return invoice;
    });
  }

  /**
   * Оплата от платёжной системы (вебхук, сверка). Ключ — операция (method, ref):
   * счёт ждёт, сумма совпала, заказа нет → платёж в сделке, счёт оплачен; та же операция повторно → ничего;
   * другая операция по закрытому счёту, заказа нет → платёж записан, событие «повторная оплата — нужен возврат»;
   * по сделке уже заказ или её нет → деньги в сделку не пишутся (их не зачесть), событие «нужен возврат или зачёт».
   * Не бросает: иначе платёжная система будет повторять уведомление бесконечно.
   */
  async confirmOnline(input: { invoiceId: string; method: "kaspi" | "cloudpayments"; ref: string; amount: number }): Promise<"paid" | "duplicate" | "extra" | "mismatch" | "unknown"> {
    return this.uow.run(async () => {
      const invoice = await this.invoices.lockById(input.invoiceId);
      if (!invoice) return "unknown" as const;
      if (invoice.paidRef === input.ref) return "duplicate" as const;
      if (!invoice.matchesAmount(input.amount)) return "mismatch" as const;
      const now = this.clock.now();
      const deal = await this.sales.deal(invoice.dealId);
      const note = `Счёт ${invoice.label}: ${input.method === "kaspi" ? "Kaspi" : "карта"}, операция ${input.ref}`;
      if (!deal || deal.orderId) {
        invoice.extraMoney(input.method, input.ref, input.amount, false, "order");
        await this.invoices.save(invoice);
        this.uow.track(invoice);
        return "extra" as const;
      }
      const payment = await this.sales.acceptOnline({ dealId: deal.id, clientId: deal.clientId, amount: input.amount, paidAt: now, method: input.method, externalRef: input.ref, invoiceId: invoice.id, note });
      if (!payment) return "duplicate" as const;
      const first = invoice.status === "pending_payment" || invoice.status === "expired" || invoice.status === "cancelled" ? invoice.markPaid(input.method, input.ref, now) : false;
      // Оплачен закрытый (отменённый, истёкший) счёт — деньги записаны и счёт оплачен; уже оплаченный повторно — «переплата».
      if (!first) invoice.extraMoney(input.method, input.ref, input.amount, true, "overpaid");
      // Оплатили прежний счёт, а открыт уже новый — новый закрываем, чтобы клиент не заплатил дважды.
      const open = await this.invoices.openFor(deal.id);
      if (open && open.id !== invoice.id && open.cancel(`оплачен счёт ${invoice.label}`)) await this.invoices.save(open);
      await this.invoices.save(invoice);
      this.uow.track(invoice);
      return first ? ("paid" as const) : ("extra" as const);
    });
  }

  /**
   * Сотрудник принял перевод по счёту (с чеком) — вызывается в транзакции приёма платежа, до записи денег:
   * счёт этой сделки и ждёт оплаты, иначе ошибка (деньги не записываются).
   */
  async markPaidManually(input: { invoiceId: string; dealId: string; paymentId: string | null }) {
    const invoice = await this.invoices.lockById(input.invoiceId);
    if (!invoice || invoice.dealId !== input.dealId) throw new OrderingError("paymentRule", "Счёт не найден");
    if (invoice.status === "paid") throw new OrderingError("paymentRule", "Счёт уже оплачен");
    invoice.markPaid("manual", input.paymentId ? `manual:${input.paymentId}` : null, this.clock.now());
    await this.invoices.save(invoice);
    this.uow.track(invoice);
    return invoice;
  }

  /** Проход планировщика: просроченные счета — «истёк». Возвращает истёкшие (для задачи менеджеру). */
  async expireOverdue(): Promise<DealInvoice[]> {
    const done: DealInvoice[] = [];
    for (const due of await this.invoices.overdue(this.clock.now(), BATCH)) {
      const expired = await this.uow.run(async () => {
        const invoice = await this.invoices.lockById(due.id);
        if (!invoice?.expire(this.clock.now())) return null;
        await this.invoices.save(invoice);
        return invoice;
      });
      if (expired) done.push(expired);
    }
    return done;
  }

  accessDue() {
    return this.invoices.accessDue(BATCH);
  }

  async setAccess(invoiceId: string, status: Parameters<DealInvoice["setAccess"]>[0], userId?: string | null) {
    await this.uow.run(async () => {
      const invoice = await this.invoices.lockById(invoiceId);
      if (!invoice) return;
      invoice.setAccess(status, userId);
      await this.invoices.save(invoice);
    });
  }
}
