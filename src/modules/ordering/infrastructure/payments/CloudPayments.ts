import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/config/env";
import { systemActor } from "@/shared/application";
import type { GiftsService, OrdersService } from "../../application";

/** Коды ответа CloudPayments: 0 — принято, 10 — неизвестный счёт, 12 — неверная сумма, 13 — платёж не принимается. */
export type CloudPaymentsCode = 0 | 10 | 12 | 13;

export function isOnlinePayment() {
  return env.paymentProvider === "cloudpayments" && !!env.cloudpayments.publicId;
}

/**
 * Адаптер вебхуков CloudPayments (check / pay / fail): проверка подписи, сверка суммы
 * и перевод уведомления в команды контекста заказов. Сертификаты — InvoiceId вида «G123».
 */
export class CloudPaymentsWebhook {
  constructor(
    private readonly orders: OrdersService,
    private readonly gifts: GiftsService,
    private readonly secret: () => string | undefined = () => env.cloudpayments.apiSecret,
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
        await this.orders.confirmPayment({ orderId: order.id, paymentId: body.TransactionId ?? null }, actor);
        return 0;
      case "fail":
        await this.orders.recordPaymentFailure(order.id, body.Reason ?? body.ReasonCode ?? "", actor);
        return 0;
      default:
        return 0;
    }
  }
}
