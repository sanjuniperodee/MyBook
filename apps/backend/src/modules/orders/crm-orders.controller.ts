import { Controller, Inject, Req } from "@nestjs/common";
import type { Output, Parsed } from "@mybook/contracts";
import type { FastifyRequest } from "fastify";
import { Permissions } from "../../core/auth/staff.decorators";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { Input } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { ORDERS_API_PORTS, ordersCallMeta, type OrdersApiPorts } from "./orders.tokens";

/**
 * Заказ в CRM: деньги, доставка, файлы для типографии, данные, связи, заметка, правка книги (15 маршрутов).
 * Вход, права (@Permissions — те же наборы, что apiStaff в mybook-api) и книга (BookAccessGuard) — guard-ами;
 * сам маршрут — общий код mybook-api через порт.
 */
@Controller()
export class CrmOrdersController {
  constructor(
    @Inject(ORDERS_API_PORTS) private readonly ports: OrdersApiPorts,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Endpoint("crmOrderMoney")
  @Permissions("orders.view")
  crmOrderMoney(@Req() req: FastifyRequest, @Input() input: Parsed<"crmOrderMoney">): Promise<Output<"crmOrderMoney"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "crmOrderMoney", input);
  }

  @Endpoint("crmOrderPay")
  crmOrderPay(@Req() req: FastifyRequest, @Input() input: Parsed<"crmOrderPay">): Promise<Output<"crmOrderPay"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "crmOrderPay", input);
  }

  @Endpoint("crmOrderRefund")
  crmOrderRefund(@Req() req: FastifyRequest, @Input() input: Parsed<"crmOrderRefund">): Promise<Output<"crmOrderRefund"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "crmOrderRefund", input);
  }

  @Endpoint("crmOrderPaymentVoid")
  @Permissions("orders.edit")
  crmOrderPaymentVoid(@Req() req: FastifyRequest, @Input() input: Parsed<"crmOrderPaymentVoid">): Promise<Output<"crmOrderPaymentVoid"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "crmOrderPaymentVoid", input);
  }

  @Endpoint("crmOrderPaymentReview")
  @Permissions("orders.edit")
  crmOrderPaymentReview(@Req() req: FastifyRequest, @Input() input: Parsed<"crmOrderPaymentReview">): Promise<Output<"crmOrderPaymentReview"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "crmOrderPaymentReview", input);
  }

  @Endpoint("crmOrderPostpay")
  @Permissions("orders.edit")
  crmOrderPostpay(@Req() req: FastifyRequest, @Input() input: Parsed<"crmOrderPostpay">): Promise<Output<"crmOrderPostpay"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "crmOrderPostpay", input);
  }

  @Endpoint("crmOrderTerms")
  @Permissions("orders.edit")
  crmOrderTerms(@Req() req: FastifyRequest, @Input() input: Parsed<"crmOrderTerms">): Promise<Output<"crmOrderTerms"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "crmOrderTerms", input);
  }

  @Endpoint("crmOrderRepriceRequest")
  @Permissions("orders.edit")
  crmOrderRepriceRequest(@Req() req: FastifyRequest, @Input() input: Parsed<"crmOrderRepriceRequest">): Promise<Output<"crmOrderRepriceRequest"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "crmOrderRepriceRequest", input);
  }

  @Endpoint("crmOrderDelivery")
  @Permissions("orders.edit")
  crmOrderDelivery(@Req() req: FastifyRequest, @Input() input: Parsed<"crmOrderDelivery">): Promise<Output<"crmOrderDelivery"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "crmOrderDelivery", input);
  }

  @Endpoint("crmOrderFiles")
  @Permissions("orders.view")
  crmOrderFiles(@Req() req: FastifyRequest, @Input() input: Parsed<"crmOrderFiles">): Promise<Output<"crmOrderFiles"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "crmOrderFiles", input);
  }

  @Endpoint("crmOrderDetails")
  @Permissions("orders.view")
  crmOrderDetails(@Req() req: FastifyRequest, @Input() input: Parsed<"crmOrderDetails">): Promise<Output<"crmOrderDetails"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "crmOrderDetails", input);
  }

  @Endpoint("crmOrderDetailsUpdate")
  @Permissions("orders.edit")
  crmOrderDetailsUpdate(@Req() req: FastifyRequest, @Input() input: Parsed<"crmOrderDetailsUpdate">): Promise<Output<"crmOrderDetailsUpdate"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "crmOrderDetailsUpdate", input);
  }

  @Endpoint("crmOrderLinks")
  @Permissions("orders.view")
  crmOrderLinks(@Req() req: FastifyRequest, @Input() input: Parsed<"crmOrderLinks">): Promise<Output<"crmOrderLinks"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "crmOrderLinks", input);
  }

  @Endpoint("crmOrderNote")
  @Permissions("orders.edit")
  crmOrderNote(@Req() req: FastifyRequest, @Input() input: Parsed<"crmOrderNote">): Promise<Output<"crmOrderNote"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "crmOrderNote", input);
  }

  @Endpoint("crmOrderBookLock")
  @Permissions("orders.edit")
  crmOrderBookLock(@Req() req: FastifyRequest, @Input() input: Parsed<"crmOrderBookLock">): Promise<Output<"crmOrderBookLock"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "crmOrderBookLock", input);
  }
}
