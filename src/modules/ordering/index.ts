import "server-only";
import type { Clock, EventBus, Logger, Mailer, UnitOfWork } from "@/shared/application";
import { toIsoDay } from "@/lib/occasions";
import { runInBackground } from "@/shared/infrastructure/background";
import { GiftsService, KaspiPaymentsService, KaspiSetupService, OrdersService, PromoService, type AgreementGateway, type BookGateway, type GiftPdfRenderer, type KaspiConfigStore, type PrintFiles } from "./application";
import type { OrderingEvent } from "./domain";
import { DrizzleGiftCardRepository } from "./infrastructure/persistence/DrizzleGiftCardRepository";
import { DrizzleOrderRepository } from "./infrastructure/persistence/DrizzleOrderRepository";
import { DrizzlePromoCodeRepository } from "./infrastructure/persistence/DrizzlePromoCodeRepository";
import { DrizzleOrderingQueries } from "./infrastructure/persistence/DrizzleOrderingQueries";
import { DrizzlePaymentInvoiceRepository } from "./infrastructure/persistence/DrizzlePaymentInvoiceRepository";
import { DrizzlePeopleGateway } from "./infrastructure/gateways/DrizzlePeopleGateway";
import { envPaymentSettings, randomCodes } from "./infrastructure/gateways/system";
import { OrderingMailer } from "./infrastructure/notifications/OrderingMailer";
import { CloudPaymentsWebhook } from "./infrastructure/payments/CloudPayments";
import { KaspiPosClient, verifyKaspiSignature } from "./infrastructure/payments/KaspiPosClient";

export * from "./domain";
export type { InvoiceOwner, KaspiConfigStore, KaspiSession, PlaceOrderCommand, PromoCheck, PromoView, PurchaseGiftCommand, UpdateOrderCommand } from "./application";
export type { OrderDetailsView, GiftView } from "./infrastructure/persistence/DrizzleOrderingQueries";
export { isOnlinePayment } from "./infrastructure/payments/CloudPayments";
export { redeemUrl } from "./infrastructure/notifications/OrderingMailer";

/** Cookie с кодом активированного сертификата — подставляется в оформление заказа. */
export const GIFT_COOKIE = "mb_gift";

export interface OrderingDeps {
  uow: UnitOfWork;
  bus: EventBus;
  clock: Clock;
  logger: Logger;
  /** Файлы для типографии (контекст Production). */
  printFiles: PrintFiles;
  /** PDF подарочного сертификата (контекст Production). */
  giftPdf: GiftPdfRenderer;
  /** Книги (контекст Authoring) — через узкий порт, реализацию даёт корень композиции. */
  books: BookGateway;
  /** Договорённая цена и предоплата клиента по ручной сделке (контекст «Продажи»). */
  agreements: AgreementGateway;
  mailer: Mailer;
  /** Настройки Kaspi Pay («Интеграции»): сессия кассира, включена ли оплата, секрет вебхуков. */
  kaspiConfig: KaspiConfigStore;
}

/** Публичный фасад контекста «Заказы». Остальной код видит только его. */
export class OrderingModule {
  readonly orders: OrdersService;
  readonly promos: PromoService;
  readonly gifts: GiftsService;
  readonly queries = new DrizzleOrderingQueries();
  readonly cloudPayments: CloudPaymentsWebhook;
  /** Оплата через Kaspi Pay: счёт по номеру или QR, вебхук и сверка статуса. */
  readonly kaspi: KaspiPaymentsService;
  /** Подключение кассира Kaspi в «Интеграциях». */
  readonly kaspiSetup: KaspiSetupService;
  readonly mailer: OrderingMailer;

  constructor(private readonly deps: OrderingDeps) {
    const orderRepo = new DrizzleOrderRepository();
    const promoRepo = new DrizzlePromoCodeRepository();
    const giftRepo = new DrizzleGiftCardRepository();
    this.orders = new OrdersService(orderRepo, promoRepo, deps.books, new DrizzlePeopleGateway(), deps.printFiles, envPaymentSettings, deps.agreements, deps.uow, deps.clock);
    this.promos = new PromoService(promoRepo, orderRepo, deps.clock);
    this.gifts = new GiftsService(giftRepo, promoRepo, randomCodes, envPaymentSettings, deps.uow, deps.clock, () => toIsoDay(deps.clock.now()));
    this.cloudPayments = new CloudPaymentsWebhook(this.orders, this.gifts);
    const kaspiPos = new KaspiPosClient(deps.kaspiConfig);
    const kaspiEnabled = async () => (await deps.kaspiConfig.config()).enabled;
    this.kaspi = new KaspiPaymentsService(new DrizzlePaymentInvoiceRepository(), orderRepo, giftRepo, this.orders, this.gifts, kaspiPos, kaspiEnabled, deps.uow, deps.clock, deps.logger);
    this.kaspiSetup = new KaspiSetupService(kaspiPos, deps.kaspiConfig);
    this.mailer = new OrderingMailer(this.queries, this.gifts, deps.mailer, deps.giftPdf);
    this.subscribe(deps.bus);
  }

  /** Собственные реакции контекста на свои события: письма и подготовка файлов после оплаты. */
  private subscribe(bus: EventBus) {
    const on = <T extends OrderingEvent["type"]>(type: T, handler: (e: Extract<OrderingEvent, { type: T }>) => Promise<void>, name: string) => bus.subscribe(type, handler as (e: OrderingEvent) => Promise<void>, name);
    on("ordering.order_placed", this.mailer.onOrderPlaced, "ordering.mail.placed");
    on("ordering.order_paid", this.mailer.onOrderPaid, "ordering.mail.paid");
    on("ordering.order_status_changed", this.mailer.onStatusChanged, "ordering.mail.status");
    on("ordering.order_cancelled", this.mailer.onOrderCancelled, "ordering.mail.cancelled");
    on("ordering.order_cancelled", (e) => this.kaspi.cancelOpenFor({ kind: "order", id: e.payload.orderId }), "ordering.kaspi.cancel_open");
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

  /** Подпись вебхука kaspi-pos-automation. */
  async verifyKaspiWebhook(rawBody: string, signature: string | null) {
    return verifyKaspiSignature(rawBody, signature, await this.deps.kaspiConfig.webhookSecret());
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
