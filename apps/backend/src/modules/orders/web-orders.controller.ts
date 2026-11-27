import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import type { Output, Parsed } from "@mybook/contracts";
import type { FastifyRequest } from "fastify";
import { SESSION_USERS, sessionToken, type SessionUsers } from "../../core/auth/session";
import { STAFF_ACCESS, type StaffAccessPort, type StaffMember } from "../../core/auth/staff";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { clientIp } from "../../core/http/client-ip";
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
    @Inject(STAFF_ACCESS) private readonly access: StaffAccessPort,
  ) {}

  /**
   * Маршрут клиента (auth: user), но сотрудник тоже открывает заказ клиента (страница /orders/[id] из CRM): StaffGuard
   * здесь не работает, поэтому роль и правило IP/2FA определяем сами — общий код пускает только с orders.view, своей
   * областью и без блокировки правилом (gate), иначе 404, как чужому.
   */
  private async staffOf(req: FastifyRequest): Promise<StaffMember | null> {
    const user = req.user;
    if (!user || user.role !== "admin" || user.staffDisabled) return null;
    const resolved = await this.access.resolve(user, clientIp(req, this.config.edgeIpSecret));
    if (!resolved) return null;
    const { context, gate } = resolved;
    return { user, roleName: context.roleName, roleKey: context.roleKey, scope: context.scope, permissions: context.permissions, isOwner: context.isOwner, context, gate };
  }

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
  async webOrderDetail(@Req() req: FastifyRequest, @Input() input: Parsed<"webOrderDetail">): Promise<Output<"webOrderDetail"> | Response> {
    return this.ports.run({ ...ordersCallMeta(req, this.config), staff: await this.staffOf(req) }, "webOrderDetail", input);
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
