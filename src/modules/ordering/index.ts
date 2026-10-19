import "server-only";
import type { Clock, EventBus, Logger, Mailer, SettingsStore, StaffNotifier, UnitOfWork } from "@/shared/application";
import { toIsoDay } from "@/lib/occasions";
import { runInBackground } from "@/shared/infrastructure/background";
import { DealInvoiceLifecycle, DealInvoicesService, GiftsService, KaspiPaymentsService, KaspiSetupService, KaspiWatchService, OrderPaymentsService, OrdersService, PromoService, type InvoiceSales, type KaspiWatchSettingKey, type AgreementGateway, type BookGateway, type GiftPdfRenderer, type KaspiConfigStore, type PrintFiles } from "./application";
import type { OrderingEvent } from "./domain";
import { DrizzleGiftCardRepository } from "./infrastructure/persistence/DrizzleGiftCardRepository";
import { DrizzleOrderRepository } from "./infrastructure/persistence/DrizzleOrderRepository";
import { DrizzlePromoCodeRepository } from "./infrastructure/persistence/DrizzlePromoCodeRepository";
import { DrizzleOrderingQueries } from "./infrastructure/persistence/DrizzleOrderingQueries";
import { DrizzlePaymentInvoiceRepository } from "./infrastructure/persistence/DrizzlePaymentInvoiceRepository";
import { DrizzleOrderPaymentRepository } from "./infrastructure/persistence/DrizzleOrderPaymentRepository";
import { DrizzleDealInvoiceRepository } from "./infrastructure/persistence/DrizzleDealInvoiceRepository";
import { DrizzleDealInvoiceLifecycleStore } from "./infrastructure/persistence/DrizzleDealInvoiceLifecycleStore";
import { storageReceiptFiles } from "./infrastructure/gateways/receiptFiles";
import { DrizzlePeopleGateway } from "./infrastructure/gateways/DrizzlePeopleGateway";
import { envPaymentSettings, randomCodes } from "./infrastructure/gateways/system";
import { OrderingMailer } from "./infrastructure/notifications/OrderingMailer";
import { CloudPaymentsWebhook } from "./infrastructure/payments/CloudPayments";
import { KaspiPosClient, verifyKaspiSignature } from "./infrastructure/payments/KaspiPosClient";

export * from "./domain";
export type { InvoiceOwner, KaspiConfigStore, KaspiSession, KaspiWatchSettingKey, PlaceOrderCommand, PromoCheck, PromoView, PurchaseGiftCommand, UpdateOrderCommand } from "./application";
export type { OrderDetailsView, GiftView } from "./infrastructure/persistence/DrizzleOrderingQueries";
export { isOnlinePayment } from "./infrastructure/payments/CloudPayments";
export { redeemUrl } from "./infrastructure/notifications/OrderingMailer";
export { DEAL_INVOICE_CLOSE_REASONS, dealInvoiceCancelledNote } from "./application/DealInvoiceLifecycle";
export { KASPI_ALERT_AFTER_MAX } from "./application/KaspiWatchService";

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
  /** Сделки и их деньги (контекст «Продажи») — для счетов из чата. */
  invoiceSales: InvoiceSales;
  /** Слежка за кассиром Kaspi: состояние между проверками и порог тревоги («Рабочее пространство»). */
  settings: SettingsStore<KaspiWatchSettingKey>;
  /** Тревога «кассир Kaspi отключён» руководителям: CRM и push. */
  notifier: StaffNotifier<"settings.manage">;
}

/** Публичный фасад контекста «Заказы». Остальной код видит только его. */
export class OrderingModule {
  readonly orders: OrdersService;
  /** Счета из чата по сделкам: выпуск, оплата по ссылке, подтверждение, истечение. */
  readonly invoices: DealInvoicesService;
  /** Счета из чата в жизни сделки и заказа: слияние и удаление сделки (порт продаж), закрытие заказом. */
  readonly invoiceLifecycle: DealInvoiceLifecycle;
  /** Журнал денег по заказу: перевод с чеком, онлайн-оплаты, постоплата. */
  readonly payments: OrderPaymentsService;
  readonly promos: PromoService;
  readonly gifts: GiftsService;
  readonly queries = new DrizzleOrderingQueries();
  readonly cloudPayments: CloudPaymentsWebhook;
  /** Оплата через Kaspi Pay: счёт по номеру или QR, вебхук и сверка статуса. */
  readonly kaspi: KaspiPaymentsService;
  /** Подключение кассира Kaspi в «Интеграциях». */
  readonly kaspiSetup: KaspiSetupService;
  /** Сигнал «кассир Kaspi отключён»: проверка в проходе планировщика, тревога руководителям, плашка менеджерам. */
  readonly kaspiWatch: KaspiWatchService;
  readonly mailer: OrderingMailer;

  constructor(private readonly deps: OrderingDeps) {
    const orderRepo = new DrizzleOrderRepository();
    const promoRepo = new DrizzlePromoCodeRepository();
    const giftRepo = new DrizzleGiftCardRepository();
    this.invoices = new DealInvoicesService(new DrizzleDealInvoiceRepository(), deps.invoiceSales, deps.uow, deps.clock);
    this.payments = new OrderPaymentsService(orderRepo, new DrizzleOrderPaymentRepository(), storageReceiptFiles, deps.uow, deps.clock);
    this.invoiceLifecycle = new DealInvoiceLifecycle(new DrizzleDealInvoiceLifecycleStore(), deps.uow);
    this.orders = new OrdersService(orderRepo, promoRepo, deps.books, new DrizzlePeopleGateway(), deps.printFiles, envPaymentSettings, deps.agreements, deps.uow, deps.clock, this.payments, this.invoiceLifecycle);
    this.promos = new PromoService(promoRepo, orderRepo, deps.clock);
    this.gifts = new GiftsService(giftRepo, promoRepo, randomCodes, envPaymentSettings, deps.uow, deps.clock, () => toIsoDay(deps.clock.now()));
    // Счета из чата для платёжных систем: P<n> в CloudPayments и цель deal_invoice в Kaspi.
    const dealInvoices = { repo: new DrizzleDealInvoiceRepository(), service: this.invoices, sales: deps.invoiceSales, clock: deps.clock };
    this.cloudPayments = new CloudPaymentsWebhook(this.orders, this.gifts, undefined, dealInvoices);
    const kaspiPos = new KaspiPosClient(deps.kaspiConfig);
    const kaspiEnabled = async () => (await deps.kaspiConfig.config()).enabled;
    this.kaspi = new KaspiPaymentsService(new DrizzlePaymentInvoiceRepository(), orderRepo, giftRepo, this.orders, this.gifts, kaspiPos, kaspiEnabled, deps.uow, deps.clock, deps.logger, dealInvoices);
    this.kaspiSetup = new KaspiSetupService(kaspiPos, deps.kaspiConfig);
    this.kaspiWatch = new KaspiWatchService(deps.kaspiConfig, kaspiPos, deps.settings, deps.notifier, deps.clock);
    this.mailer = new OrderingMailer(this.queries, this.gifts, deps.mailer, deps.giftPdf);
    this.subscribe(deps.bus);
  }

  /** Собственные реакции контекста на свои события: письма и подготовка файлов после оплаты. */
  private subscribe(bus: EventBus) {
    const on = <T extends OrderingEvent["type"]>(type: T, handler: (e: Extract<OrderingEvent, { type: T }>) => Promise<void>, name: string) => bus.subscribe(type, handler as (e: OrderingEvent) => Promise<void>, name);
    on("ordering.order_placed", this.mailer.onOrderPlaced, "ordering.mail.placed");
    on("ordering.order_paid", this.mailer.onOrderPaid, "ordering.mail.paid");
    on("ordering.order_status_changed", this.mailer.onStatusChanged, "ordering.mail.status");
    on("ordering.tracking_added", this.mailer.onTrackingAdded, "ordering.mail.tracking");
    on("ordering.order_cancelled", this.mailer.onOrderCancelled, "ordering.mail.cancelled");
    on("ordering.order_cancelled", (e) => this.kaspi.cancelOpenFor({ kind: "order", id: e.payload.orderId }), "ordering.kaspi.cancel_open");
    // Счёт из чата закрыт без оплаты — ждущую попытку Kaspi по нему отменяем сразу (cancelOpenFor сначала сверяет с Kaspi).
    on("ordering.deal_invoice_closed", (e) => this.kaspi.cancelOpenFor({ kind: "deal_invoice", id: e.payload.invoiceId }), "ordering.kaspi.cancel_deal_invoice");
    on("ordering.payment_claimed", this.mailer.onPaymentClaimed, "ordering.mail.claimed");
    on("ordering.gift_purchased", this.mailer.onGiftPurchased, "ordering.mail.gift_purchased");
    on("ordering.gift_paid", this.mailer.onGiftPaid, "ordering.mail.gift_paid");
    on("ordering.gift_payment_claimed", this.mailer.onGiftPaymentClaimed, "ordering.mail.gift_claimed");
    on(
      "ordering.order_paid",
      async (e) => {
        // Постоплата получена после печати — файлы уже готовы.
        if (e.payload.settled) return;
        // Файлы для типографии готовим в фоне, чтобы не задерживать ответ платёжной системе.
        runInBackground(async () => {
          const { spec } = await this.deps.printFiles.warmUp({ orderId: e.payload.orderId, bookId: e.payload.bookId, number: e.payload.number });
          if (spec) await this.orders.recordPrintSpec(e.payload.orderId, spec);
        }, this.deps.logger);
      },
      "ordering.print.warm_up",
    );
    // В печать с постоплатой — файлы для типографии нужны так же, как после оплаты.
    on(
      "ordering.order_status_changed",
      async (e) => {
        if (e.payload.from !== "pending_payment" || e.payload.to !== "in_production") return;
        runInBackground(async () => {
          const { spec } = await this.deps.printFiles.warmUp({ orderId: e.payload.orderId, bookId: e.payload.bookId, number: e.payload.number });
          if (spec) await this.orders.recordPrintSpec(e.payload.orderId, spec);
        }, this.deps.logger);
      },
      "ordering.print.warm_up_postpay",
    );
  }

  /** Подпись вебхука kaspi-pos-automation. */
  async verifyKaspiWebhook(rawBody: string, signature: string | null) {
    return verifyKaspiSignature(rawBody, signature, await this.deps.kaspiConfig.webhookSecret());
  }

  /** Получатель платежа в Kaspi (организация кассира) — для страницы оплаты и сообщения со счётом; без запроса к Kaspi. */
  async kaspiRecipient(): Promise<string | null> {
    return (await this.deps.kaspiConfig.config()).session?.orgName.trim() || null;
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
