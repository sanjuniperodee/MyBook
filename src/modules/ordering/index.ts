import "server-only";
import type { Clock, EventBus, Logger, Mailer, UnitOfWork } from "@/shared/application";
import { toIsoDay } from "@/lib/occasions";
import type { PrintFilesService } from "@/modules/production";
import { runInBackground } from "@/shared/infrastructure/background";
import { GiftsService, OrdersService, PromoService, type AgreementGateway, type BookGateway } from "./application";
import type { OrderingEvent } from "./domain";
import { DrizzleGiftCardRepository } from "./infrastructure/persistence/DrizzleGiftCardRepository";
import { DrizzleOrderRepository } from "./infrastructure/persistence/DrizzleOrderRepository";
import { DrizzlePromoCodeRepository } from "./infrastructure/persistence/DrizzlePromoCodeRepository";
import { DrizzleOrderingQueries } from "./infrastructure/persistence/DrizzleOrderingQueries";
import { DrizzlePeopleGateway } from "./infrastructure/gateways/DrizzlePeopleGateway";
import { envPaymentSettings, randomCodes } from "./infrastructure/gateways/system";
import { OrderingMailer } from "./infrastructure/notifications/OrderingMailer";
import { CloudPaymentsWebhook } from "./infrastructure/payments/CloudPayments";

export * from "./domain";
export type { PlaceOrderCommand, PromoCheck, PromoView, PurchaseGiftCommand, UpdateOrderCommand } from "./application";
export type { OrderDetailsView, GiftView } from "./infrastructure/persistence/DrizzleOrderingQueries";
export { isOnlinePayment } from "./infrastructure/payments/CloudPayments";
export { giftUrl, redeemUrl } from "./infrastructure/notifications/OrderingMailer";

/** Cookie с кодом активированного сертификата — подставляется в оформление заказа. */
export const GIFT_COOKIE = "mb_gift";

export interface OrderingDeps {
  uow: UnitOfWork;
  bus: EventBus;
  clock: Clock;
  logger: Logger;
  printFiles: PrintFilesService;
  /** Книги (контекст Authoring) — через узкий порт, реализацию даёт корень композиции. */
  books: BookGateway;
  /** Договорённая цена и предоплата клиента по ручной сделке (контекст «Продажи»). */
  agreements: AgreementGateway;
  mailer: Mailer;
}

/** Публичный фасад контекста «Заказы». Остальной код видит только его. */
export class OrderingModule {
  readonly orders: OrdersService;
  readonly promos: PromoService;
  readonly gifts: GiftsService;
  readonly queries = new DrizzleOrderingQueries();
  readonly cloudPayments: CloudPaymentsWebhook;
  readonly mailer: OrderingMailer;

  constructor(private readonly deps: OrderingDeps) {
    const orderRepo = new DrizzleOrderRepository();
    const promoRepo = new DrizzlePromoCodeRepository();
    const giftRepo = new DrizzleGiftCardRepository();
    const printFiles = { prepare: (job: { orderId: string; bookId: string; number: number }, opts?: { force?: boolean }) => deps.printFiles.prepare(job, opts) };
    this.orders = new OrdersService(orderRepo, promoRepo, deps.books, new DrizzlePeopleGateway(), printFiles, envPaymentSettings, deps.agreements, deps.uow, deps.clock);
    this.promos = new PromoService(promoRepo, orderRepo, deps.clock);
    this.gifts = new GiftsService(giftRepo, promoRepo, randomCodes, envPaymentSettings, deps.uow, deps.clock, () => toIsoDay(deps.clock.now()));
    this.cloudPayments = new CloudPaymentsWebhook(this.orders, this.gifts);
    this.mailer = new OrderingMailer(this.queries, this.gifts, deps.mailer);
    this.subscribe(deps.bus);
  }

  /** Собственные реакции контекста на свои события: письма и подготовка файлов после оплаты. */
  private subscribe(bus: EventBus) {
    const on = <T extends OrderingEvent["type"]>(type: T, handler: (e: Extract<OrderingEvent, { type: T }>) => Promise<void>, name: string) => bus.subscribe(type, handler as (e: OrderingEvent) => Promise<void>, name);
    on("ordering.order_placed", this.mailer.onOrderPlaced, "ordering.mail.placed");
    on("ordering.order_paid", this.mailer.onOrderPaid, "ordering.mail.paid");
    on("ordering.order_status_changed", this.mailer.onStatusChanged, "ordering.mail.status");
    on("ordering.order_cancelled", this.mailer.onOrderCancelled, "ordering.mail.cancelled");
    on("ordering.payment_claimed", this.mailer.onPaymentClaimed, "ordering.mail.claimed");
    on("ordering.gift_purchased", this.mailer.onGiftPurchased, "ordering.mail.gift_purchased");
    on("ordering.gift_paid", this.mailer.onGiftPaid, "ordering.mail.gift_paid");
    on("ordering.gift_payment_claimed", this.mailer.onGiftPaymentClaimed, "ordering.mail.gift_claimed");
    on(
      "ordering.order_paid",
      async (e) => {
        // Файлы для типографии готовим в фоне, чтобы не задерживать ответ платёжной системе.
        runInBackground(async () => {
          const spec = await this.deps.printFiles.warmUp({ orderId: e.payload.orderId, bookId: e.payload.bookId, number: e.payload.number });
          if (spec) await this.orders.recordPrintSpec(e.payload.orderId, spec);
        }, this.deps.logger);
      },
      "ordering.print.warm_up",
    );
  }

  /** Отложенная отправка сертификатов получателям (планировщик). */
  async deliverDueGifts(): Promise<number> {
    const due = await this.gifts.dueForDelivery(50);
    for (const g of due) {
      const view = await this.queries.giftById(g.id);
      if (view?.promo) await this.mailer.sendToRecipient(view);
    }
    return due.length;
  }

  async resendGift(giftId: string) {
    const gift = await this.queries.giftById(giftId);
    if (gift?.status === "paid" && gift.promo && gift.recipientEmail) await this.mailer.sendToRecipient(gift);
  }

  async giftPdf(token: string) {
    const gift = await this.queries.giftByToken(token);
    return gift?.promo ? { gift, pdf: await this.mailer.giftPdf(gift) } : null;
  }
}
