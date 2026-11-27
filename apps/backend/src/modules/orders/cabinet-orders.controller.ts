import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import type { Output, Parsed } from "@mybook/contracts";
import type { FastifyRequest } from "fastify";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { Input } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { BookAccess, BookAccessGuard, type AccessibleBook } from "../identity/book-access.guard";
import { ORDERS_API_PORTS, ordersCallMeta, type OrdersApiPorts } from "./orders.tokens";

/**
 * Заказ и оплата клиента в приложении «MyBooks» (9 маршрутов кабинета).
 * Вход, права (@Permissions — те же наборы, что apiStaff в mybook-api) и книга (BookAccessGuard) — guard-ами;
 * сам маршрут — общий код mybook-api через порт.
 */
@Controller()
export class CabinetOrdersController {
  constructor(
    @Inject(ORDERS_API_PORTS) private readonly ports: OrdersApiPorts,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Endpoint("cabinetCheckout")
  @UseGuards(BookAccessGuard)
  cabinetCheckout(@Req() req: FastifyRequest, @Input() input: Parsed<"cabinetCheckout">, @BookAccess() access: AccessibleBook): Promise<Output<"cabinetCheckout"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "cabinetCheckout", input, access.book);
  }

  @Endpoint("cabinetCheckoutQuote")
  @UseGuards(BookAccessGuard)
  cabinetCheckoutQuote(@Req() req: FastifyRequest, @Input() input: Parsed<"cabinetCheckoutQuote">, @BookAccess() access: AccessibleBook): Promise<Output<"cabinetCheckoutQuote"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "cabinetCheckoutQuote", input, access.book);
  }

  @Endpoint("cabinetOrderPlace")
  @UseGuards(BookAccessGuard)
  cabinetOrderPlace(@Req() req: FastifyRequest, @Input() input: Parsed<"cabinetOrderPlace">, @BookAccess() access: AccessibleBook): Promise<Output<"cabinetOrderPlace"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "cabinetOrderPlace", input, access.book);
  }

  @Endpoint("cabinetOrders")
  cabinetOrders(@Req() req: FastifyRequest, @Input() input: Parsed<"cabinetOrders">): Promise<Output<"cabinetOrders"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "cabinetOrders", input);
  }

  @Endpoint("cabinetOrder")
  cabinetOrder(@Req() req: FastifyRequest, @Input() input: Parsed<"cabinetOrder">): Promise<Output<"cabinetOrder"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "cabinetOrder", input);
  }

  @Endpoint("cabinetOrderKaspi")
  cabinetOrderKaspi(@Req() req: FastifyRequest, @Input() input: Parsed<"cabinetOrderKaspi">): Promise<Output<"cabinetOrderKaspi"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "cabinetOrderKaspi", input);
  }

  @Endpoint("cabinetOrderKaspiStatus")
  cabinetOrderKaspiStatus(@Req() req: FastifyRequest, @Input() input: Parsed<"cabinetOrderKaspiStatus">): Promise<Output<"cabinetOrderKaspiStatus"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "cabinetOrderKaspiStatus", input);
  }

  @Endpoint("cabinetOrderClaim")
  cabinetOrderClaim(@Req() req: FastifyRequest, @Input() input: Parsed<"cabinetOrderClaim">): Promise<Output<"cabinetOrderClaim"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "cabinetOrderClaim", input);
  }

  @Endpoint("cabinetOrderCancel")
  cabinetOrderCancel(@Req() req: FastifyRequest, @Input() input: Parsed<"cabinetOrderCancel">): Promise<Output<"cabinetOrderCancel"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "cabinetOrderCancel", input);
  }
}
