import { Controller, Inject, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { SiteRoute } from "../../core/http/site-route";
import { SiteOpsBridge } from "./site-ops.bridge";

/** Деньги сайта: Kaspi и CloudPayments, оплаты, возвраты и чеки CRM, файлы заказа (16 маршрутов). Обработчик — сайта, через мост (site-ops.bridge.ts). */
@Controller()
export class SitePaymentsController {
  constructor(@Inject(SiteOpsBridge) private readonly bridge: SiteOpsBridge) {}

  /** Kaspi Pay: события оплаты (подпись HMAC по сырому телу). */
  @SiteRoute("POST", "/api/payments/kaspi/webhook", { auth: "none" })
  postPaymentsKaspiWebhook(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "POST /api/payments/kaspi/webhook");
  }

  /** Счёт Kaspi клиенту (вход клиента). */
  @SiteRoute("POST", "/api/payments/kaspi/invoices", { auth: "none" })
  postPaymentsKaspiInvoices(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "POST /api/payments/kaspi/invoices");
  }

  /** Статус счёта Kaspi. */
  @SiteRoute("GET", "/api/payments/kaspi/invoices/{id}", { auth: "none" })
  getPaymentsKaspiInvoicesById(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "GET /api/payments/kaspi/invoices/{id}");
  }

  /** Отменить счёт Kaspi. */
  @SiteRoute("DELETE", "/api/payments/kaspi/invoices/{id}", { auth: "none" })
  deletePaymentsKaspiInvoicesById(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "DELETE /api/payments/kaspi/invoices/{id}");
  }

  /** CloudPayments: уведомления (подпись HMAC). */
  @SiteRoute("POST", "/api/payments/cloudpayments/{event}", { auth: "none" })
  postPaymentsCloudpaymentsByEvent(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "POST /api/payments/cloudpayments/{event}");
  }

  /** Файлы заказа для типографии и PDF для чтения. */
  @SiteRoute("GET", "/api/orders/{id}/files/{kind}", { auth: "none" })
  getOrdersByIdFilesByKind(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "GET /api/orders/{id}/files/{kind}");
  }

  /** Ход вёрстки файлов заказа. */
  @SiteRoute("GET", "/api/orders/{id}/render-progress", { auth: "none" })
  getOrdersByIdRenderProgress(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "GET /api/orders/{id}/render-progress");
  }

  /** Оплата по сделке (CRM). */
  @SiteRoute("POST", "/api/admin/deals/{id}/payments", { auth: "none" })
  postAdminDealsByIdPayments(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "POST /api/admin/deals/{id}/payments");
  }

  /** Чек к оплате сделки. */
  @SiteRoute("POST", "/api/admin/deals/{id}/receipts", { auth: "none" })
  postAdminDealsByIdReceipts(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "POST /api/admin/deals/{id}/receipts");
  }

  /** Чек сертификата. */
  @SiteRoute("GET", "/api/admin/gifts/{id}/receipt", { auth: "none" })
  getAdminGiftsByIdReceipt(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "GET /api/admin/gifts/{id}/receipt");
  }

  /** Чек сертификата — загрузить. */
  @SiteRoute("POST", "/api/admin/gifts/{id}/receipt", { auth: "none" })
  postAdminGiftsByIdReceipt(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "POST /api/admin/gifts/{id}/receipt");
  }

  /** Чек оплаты заказа. */
  @SiteRoute("GET", "/api/admin/order-payments/{id}/receipt", { auth: "none" })
  getAdminOrderPaymentsByIdReceipt(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "GET /api/admin/order-payments/{id}/receipt");
  }

  /** Оплата заказа с чеком. */
  @SiteRoute("POST", "/api/admin/orders/{id}/payments", { auth: "none" })
  postAdminOrdersByIdPayments(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "POST /api/admin/orders/{id}/payments");
  }

  /** Возврат по заказу. */
  @SiteRoute("POST", "/api/admin/orders/{id}/refunds", { auth: "none" })
  postAdminOrdersByIdRefunds(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "POST /api/admin/orders/{id}/refunds");
  }

  /** Удалить ошибочную оплату сделки. */
  @SiteRoute("DELETE", "/api/admin/payments/{id}", { auth: "none" })
  deleteAdminPaymentsById(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "DELETE /api/admin/payments/{id}");
  }

  /** Чек оплаты сделки. */
  @SiteRoute("GET", "/api/admin/receipts/{id}", { auth: "none" })
  getAdminReceiptsById(@Req() req: FastifyRequest): Promise<Response> {
    return this.bridge.run(req, "GET /api/admin/receipts/{id}");
  }
}
