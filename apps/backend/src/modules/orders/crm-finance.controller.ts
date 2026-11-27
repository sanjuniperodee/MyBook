import { Controller, Inject, Req } from "@nestjs/common";
import type { Output, Parsed } from "@mybook/contracts";
import type { FastifyRequest } from "fastify";
import { Permissions } from "../../core/auth/staff.decorators";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { Input } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { ORDERS_API_PORTS, ordersCallMeta, type OrdersApiPorts } from "./orders.tokens";

/**
 * «Финансы», «Расходы», «Прибыль» и счета сделки в CRM (14 маршрутов).
 * Вход, права (@Permissions — те же наборы, что apiStaff в mybook-api) и книга (BookAccessGuard) — guard-ами;
 * сам маршрут — общий код mybook-api через порт.
 */
@Controller()
export class CrmFinanceController {
  constructor(
    @Inject(ORDERS_API_PORTS) private readonly ports: OrdersApiPorts,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Endpoint("crmFinance")
  @Permissions("analytics.view")
  crmFinance(@Req() req: FastifyRequest, @Input() input: Parsed<"crmFinance">): Promise<Output<"crmFinance"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "crmFinance", input);
  }

  @Endpoint("crmFinanceReview")
  @Permissions("analytics.view")
  crmFinanceReview(@Req() req: FastifyRequest, @Input() input: Parsed<"crmFinanceReview">): Promise<Output<"crmFinanceReview"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "crmFinanceReview", input);
  }

  @Endpoint("crmFinanceResolve")
  @Permissions("analytics.view")
  crmFinanceResolve(@Req() req: FastifyRequest, @Input() input: Parsed<"crmFinanceResolve">): Promise<Output<"crmFinanceResolve"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "crmFinanceResolve", input);
  }

  @Endpoint("crmFinanceUndo")
  @Permissions("analytics.view")
  crmFinanceUndo(@Req() req: FastifyRequest, @Input() input: Parsed<"crmFinanceUndo">): Promise<Output<"crmFinanceUndo"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "crmFinanceUndo", input);
  }

  @Endpoint("crmExpenses")
  @Permissions("finance.view")
  crmExpenses(@Req() req: FastifyRequest, @Input() input: Parsed<"crmExpenses">): Promise<Output<"crmExpenses"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "crmExpenses", input);
  }

  @Endpoint("crmExpenseAdd")
  @Permissions("finance.manage")
  crmExpenseAdd(@Req() req: FastifyRequest, @Input() input: Parsed<"crmExpenseAdd">): Promise<Output<"crmExpenseAdd"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "crmExpenseAdd", input);
  }

  @Endpoint("crmExpenseUpdate")
  @Permissions("finance.manage")
  crmExpenseUpdate(@Req() req: FastifyRequest, @Input() input: Parsed<"crmExpenseUpdate">): Promise<Output<"crmExpenseUpdate"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "crmExpenseUpdate", input);
  }

  @Endpoint("crmExpenseRemove")
  @Permissions("finance.manage")
  crmExpenseRemove(@Req() req: FastifyRequest, @Input() input: Parsed<"crmExpenseRemove">): Promise<Output<"crmExpenseRemove"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "crmExpenseRemove", input);
  }

  @Endpoint("crmProfit")
  @Permissions("finance.view")
  crmProfit(@Req() req: FastifyRequest, @Input() input: Parsed<"crmProfit">): Promise<Output<"crmProfit"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "crmProfit", input);
  }

  @Endpoint("crmProfitFees")
  @Permissions("finance.manage")
  crmProfitFees(@Req() req: FastifyRequest, @Input() input: Parsed<"crmProfitFees">): Promise<Output<"crmProfitFees"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "crmProfitFees", input);
  }

  @Endpoint("crmInvoiceForm")
  @Permissions("chats.send", "deals.edit")
  crmInvoiceForm(@Req() req: FastifyRequest, @Input() input: Parsed<"crmInvoiceForm">): Promise<Output<"crmInvoiceForm"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "crmInvoiceForm", input);
  }

  @Endpoint("crmInvoiceIssue")
  @Permissions("chats.send", "deals.edit")
  crmInvoiceIssue(@Req() req: FastifyRequest, @Input() input: Parsed<"crmInvoiceIssue">): Promise<Output<"crmInvoiceIssue"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "crmInvoiceIssue", input);
  }

  @Endpoint("crmInvoiceCancel")
  @Permissions("deals.edit")
  crmInvoiceCancel(@Req() req: FastifyRequest, @Input() input: Parsed<"crmInvoiceCancel">): Promise<Output<"crmInvoiceCancel"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "crmInvoiceCancel", input);
  }

  @Endpoint("crmInvoiceResend")
  @Permissions("chats.send", "deals.edit")
  crmInvoiceResend(@Req() req: FastifyRequest, @Input() input: Parsed<"crmInvoiceResend">): Promise<Output<"crmInvoiceResend"> | Response> {
    return this.ports.run(ordersCallMeta(req, this.config), "crmInvoiceResend", input);
  }
}
