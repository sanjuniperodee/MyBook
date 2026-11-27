import { Controller, Inject, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { Output, Parsed } from "@mybook/contracts";
import type { Locale } from "@/i18n/config";
import { DISCOUNT_HOURS } from "@/modules/marketing/domain/offers";
import { botTraceItems, botTraceRows, discountPercents, offerHourOptions } from "@/modules/messaging/ui/crm-chat-view";
import { refusedResponse } from "@/modules/sales/ui/crm-forms";
import type { StaffMember } from "../../core/auth/staff";
import { CurrentStaff, Permissions } from "../../core/auth/staff.decorators";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { ApiError } from "../../core/errors/api-error";
import { clientIp } from "../../core/http/client-ip";
import { Input, RequestLocale, SessionToken } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { CRM_CHATS_PORTS, type CrmChatsPorts, type CrmRequestMeta } from "./crm-core.tokens";

/**
 * Контекст 4A — бот («Почему так?», запуск/остановка) и коммерческие предложения (КП) в чатах CRM (5 маршрутов API v1).
 */
@Controller()
export class CrmChatsController {
  constructor(
    @Inject(CRM_CHATS_PORTS) private readonly chats: CrmChatsPorts,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private metaOf(staff: StaffMember, token: string | null, req: FastifyRequest, locale: Locale): CrmRequestMeta {
    return { staff, token, ip: clientIp(req, this.config.edgeIpSecret), locale };
  }

  @Endpoint("crmChatBotTrace")
  @Permissions("chats.view")
  async botTrace(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @Req() req: FastifyRequest,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmChatBotTrace">,
  ): Promise<Output<"crmChatBotTrace"> | Response> {
    const r = await this.chats.botTrace(this.metaOf(staff, token, req, locale), input.chatId, input.messageId);
    if (!r.trace) return refusedResponse(r.error ?? "След хода не найден");
    return { rows: botTraceRows(r.trace) };
  }

  @Endpoint("crmChatBotTraces")
  @Permissions("chats.view")
  async botTraces(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"crmChatBotTraces">): Promise<Output<"crmChatBotTraces">> {
    const conv = await this.chats.conversation(input.chatId);
    if (!conv || !staff.context.canSee(conv.assigneeId)) throw new ApiError(404, "notFound");
    const list = await this.chats.botTraces(conv.id, 15);
    return { items: botTraceItems(list) };
  }

  @Endpoint("crmChatBot")
  @Permissions("chats.view", "chats.send")
  async chatBot(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @Req() req: FastifyRequest,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmChatBot">,
  ): Promise<Output<"crmChatBot">> {
    const meta = this.metaOf(staff, token, req, locale);
    if (input.body.run) {
      await this.chats.startBot(meta, input.chatId);
      return { ok: true, message: "Бот запущен" };
    }
    await this.chats.stopBot(meta, input.chatId);
    return { ok: true, message: "Бот остановлен" };
  }

  @Endpoint("crmChatOffers")
  @Permissions("chats.view")
  async chatOffers(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"crmChatOffers">): Promise<Output<"crmChatOffers">> {
    const conv = await this.chats.conversation(input.chatId);
    if (!conv || !staff.context.canSee(conv.assigneeId)) throw new ApiError(404, "notFound");
    const o = await this.chats.chatOffers(conv.clientId, staff.context.can("promo.give"));
    return {
      order: o.order,
      book: o.book,
      maxDiscount: o.maxDiscount,
      percents: discountPercents(o.maxDiscount),
      hours: [...DISCOUNT_HOURS],
      hourOptions: offerHourOptions(DISCOUNT_HOURS),
      canSend: staff.context.can("chats.send") && staff.context.canWork(conv.assigneeId),
    };
  }

  @Endpoint("crmChatOfferSend")
  @Permissions("chats.view", "chats.send")
  async chatOfferSend(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @Req() req: FastifyRequest,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmChatOfferSend">,
  ): Promise<Output<"crmChatOfferSend"> | Response> {
    const b = input.body;
    const meta = this.metaOf(staff, token, req, locale);
    if (b.kind === "discount") {
      if (b.percent === undefined || b.hours === undefined) return refusedResponse("Укажите размер скидки и срок");
      const r = await this.chats.sendOffer(meta, input.chatId, { kind: "discount", percent: b.percent, hours: b.hours });
      if (!r.ok) return refusedResponse(r.message);
      return { ok: true, message: r.message };
    }
    const r = await this.chats.sendOffer(meta, input.chatId, { kind: b.kind });
    if (!r.ok) return refusedResponse(r.message);
    return { ok: true, message: r.message };
  }
}
