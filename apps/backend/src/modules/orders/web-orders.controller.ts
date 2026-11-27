import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import type { Output, Parsed } from "@mybook/contracts";
import type { FastifyRequest } from "fastify";
import { SESSION_USERS, sessionToken, type SessionUsers } from "../../core/auth/session";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { Input } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { BookAccess, BookAccessGuard, type AccessibleBook } from "../identity/book-access.guard";
import { ORDERS_API_PORTS, ordersCallMeta, type OrdersApiPorts } from "./orders.tokens";

/**
 * Оформление, заказы, согласование макета и оплата по ссылке для веба (9 маршрутов section "orders"; страница оплаты — без входа).
 * Вход, права (@Permissions — те же наборы, что apiStaff в mybook-api) и книга (BookAccessGuard) — guard-ами;
 * сам маршрут — общий код mybook-api через порт.
 */
@Controller()
export class WebOrdersController {
  constructor(
    @Inject(ORDERS_API_PORTS) private readonly ports: OrdersApiPorts,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SESSION_USERS) private readonly sessions: SessionUsers,
  ) {}

  @Endpoint("webCheckoutPage")
  @UseGuards(BookAccessGuard)
  webCheckoutPage(@Req() req: FastifyRequest, @Input() input: Parsed<"webCheckoutPage">, @BookAccess() access: AccessibleBook): Promise<Output<"webCheckoutPage"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "webCheckoutPage", input, access.book);
  }

  @Endpoint("webPromoCheck")
  webPromoCheck(@Req() req: FastifyRequest, @Input() input: Parsed<"webPromoCheck">): Promise<Output<"webPromoCheck"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "webPromoCheck", input);
  }

  @Endpoint("webOrderPlace")
  webOrderPlace(@Req() req: FastifyRequest, @Input() input: Parsed<"webOrderPlace">): Promise<Output<"webOrderPlace"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "webOrderPlace", input);
  }

  @Endpoint("webOrdersList")
  webOrdersList(@Req() req: FastifyRequest, @Input() input: Parsed<"webOrdersList">): Promise<Output<"webOrdersList"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "webOrdersList", input);
  }

  @Endpoint("webOrderDetail")
  webOrderDetail(@Req() req: FastifyRequest, @Input() input: Parsed<"webOrderDetail">): Promise<Output<"webOrderDetail"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "webOrderDetail", input);
  }

  @Endpoint("webOrderLayoutApprove")
  webOrderLayoutApprove(@Req() req: FastifyRequest, @Input() input: Parsed<"webOrderLayoutApprove">): Promise<Output<"webOrderLayoutApprove"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "webOrderLayoutApprove", input);
  }

  @Endpoint("webPayPage")
  webPayPage(@Req() req: FastifyRequest, @Input() input: Parsed<"webPayPage">): Promise<Output<"webPayPage"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "webPayPage", input);
  }

  /**
   * Ссылку оплаты открывают без входа (auth: none — SessionGuard пользователя не ищет), но сотрудник, открывший её из
   * CRM, — не «клиент посмотрел»: вошедшего определяем по сессии сами, как getCurrentUser() в mybook-api.
   */
  @Endpoint("webPayViewed")
  async webPayViewed(@Req() req: FastifyRequest, @Input() input: Parsed<"webPayViewed">): Promise<Output<"webPayViewed"> | Response> {
    const token = sessionToken(req);
    const user = token ? await this.sessions.user(token) : null;
    return this.ports.run({ ...ordersCallMeta(req, this.config), user }, "webPayViewed", input);
  }

  @Endpoint("webPayClaim")
  webPayClaim(@Req() req: FastifyRequest, @Input() input: Parsed<"webPayClaim">): Promise<Output<"webPayClaim"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "webPayClaim", input);
  }
}
