import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/config/env";
import { site } from "@/config/site";
import { systemActor, type Clock } from "@/shared/application";
import type { DealInvoicesService, GiftsService, InvoiceSales, OrdersService } from "../../application";
import type { DealInvoiceRepository } from "../../domain";

/** Коды ответа CloudPayments: 0 — принято, 10 — неизвестный счёт, 12 — неверная сумма, 13 — платёж не принимается. */
type CloudPaymentsCode = 0 | 10 | 12 | 13;

/** Счета из чата по сделкам (InvoiceId «P<номер>»): поиск по номеру, подтверждение по операции, сделка (есть ли заказ). */
export interface CloudDealInvoices {
  repo: Pick<DealInvoiceRepository, "findByNumber">;
  service: Pick<DealInvoicesService, "confirmOnline">;
  sales: Pick<InvoiceSales, "deal">;
  clock: Clock;
}

export function isOnlinePayment() {
  return env.paymentProvider === "cloudpayments" && !!env.cloudpayments.publicId;
}

/**
 * Адаптер вебхуков CloudPayments (check / pay / fail): проверка подписи, сверка суммы
 * и перевод уведомления в команды контекста заказов. Сертификаты — InvoiceId вида «G123», счета из чата — «P12».
 */
export class CloudPaymentsWebhook {
  constructor(
    private readonly orders: OrdersService,
    private readonly gifts: GiftsService,
    private readonly secret: () => string | undefined = () => env.cloudpayments.apiSecret,
    private readonly dealInvoices: CloudDealInvoices | null = null,
  ) {}

  /** base64(HMAC-SHA256(тело запроса, API Secret)). */
  verify(rawBody: string, signature: string | null): boolean {
    const secret = this.secret();
    if (!signature || !secret) return false;
    const expected = Buffer.from(createHmac("sha256", secret).update(rawBody, "utf8").digest("base64"));
    const got = Buffer.from(signature);
    return expected.length === got.length && timingSafeEqual(expected, got);
  }

  async handle(event: string, body: Record<string, string>): Promise<CloudPaymentsCode> {
    const actor = systemActor("cloudpayments");
    const invoice = body.InvoiceId ?? "";
    const amount = Number(body.Amount);
    // Счёт из чата — до разбора номера заказа: «P12» не должен стать заказом №12.
    if (/^P\d+$/.test(invoice)) return this.dealInvoice(event, Number(invoice.slice(1)), amount, body);
    if (/^G\d+$/.test(invoice)) {
      const gift = await this.gifts.findByNumber(Number(invoice.slice(1)));
      if (!gift) return 10;
      if (!gift.matchesPayment(amount, body.Currency)) return 12;
      if (event === "check") return gift.status === "pending_payment" ? 0 : 13;
      if (event === "pay") await this.gifts.confirmPayment(gift.id, body.TransactionId ?? null, actor);
      return 0;
    }
    const order = await this.orders.findByNumber(Number(invoice));
    if (!order) return 10;
    if (!order.matchesPayment(amount, body.Currency)) return 12;
    switch (event) {
      case "check":
        return order.status === "pending_payment" ? 0 : 13;
      case "pay":
        // Ответ 0 в любом случае — деньги уже списаны; второй платёж или оплату отменённого заказа видит сотрудник (B13).
        await this.orders.acceptProviderPayment({ orderId: order.id, paymentId: body.TransactionId ?? null, provider: "CloudPayments", operationId: body.TransactionId ?? "—", amount }, actor);
        return 0;
      case "fail":
        await this.orders.recordPaymentFailure(order.id, body.Reason ?? body.ReasonCode ?? "", actor);
        return 0;
      default:
        return 0;
    }
  }

  /**
   * Счёт из чата P<n>. check: 0 — ждёт оплаты (не истёк, по сделке нет заказа) и сумма совпала; 13 — оплачен, отменён,
   * истёк или по сделке уже заказ; 12 — сумма или валюта. pay — подтверждение по операции (TransactionId): повтор
   * уведомления ничего не делает, оплата закрытого счёта — «нужен возврат или зачёт» (решает счёт). Ответ на pay — 0:
   * деньги уже списаны.
   */
  private async dealInvoice(event: string, number: number, amount: number, body: Record<string, string>): Promise<CloudPaymentsCode> {
    if (!this.dealInvoices) return 10;
    const invoice = await this.dealInvoices.repo.findByNumber(number);
    if (!invoice) return 10;
    if (!invoice.matchesAmount(amount) || (body.Currency && body.Currency !== site.currency)) return 12;
    switch (event) {
      case "check": {
        if (!invoice.isPayable(this.dealInvoices.clock.now())) return 13;
        const deal = await this.dealInvoices.sales.deal(invoice.dealId);
        return deal && !deal.orderId ? 0 : 13;
      }
      case "pay": {
        const ref = body.TransactionId?.trim();
        // Без номера операции платёж не засчитать идемпотентно — разбирается сотрудник по выписке CloudPayments.
        if (!ref) return 13;
        await this.dealInvoices.service.confirmOnline({ invoiceId: invoice.id, method: "cloudpayments", ref, amount });
        return 0;
      }
      default:
        // fail — счёт ждёт дальше, клиент может попробовать ещё раз.
        return 0;
    }
  }
}
