import { Controller, Inject, Logger, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { Output, Parsed } from "@mybook/contracts";
import { admin } from "@/i18n/admin";
import type { Locale } from "@/i18n/config";
import type { StaffMember } from "../../core/auth/staff";
import { CurrentStaff, Permissions } from "../../core/auth/staff.decorators";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { ApiError } from "../../core/errors/api-error";
import { Input, RequestLocale, SessionToken } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { callContext, okOrRefused, refused } from "./crm-mobile-api.helpers";
import { CRM_MOBILE_API_PORTS, type CrmChatProductsResult, type CrmMobileApiPorts } from "./crm-mobile-api.tokens";

/**
 * Операции с чатами, сообщениями, голосовыми и каталогом WhatsApp
 * (18 маршрутов из `crmMobileRestRoutes`).
 */
@Controller()
export class CrmChatsOpsController {
  private readonly log = new Logger("crm-chats-ops");

  constructor(
    @Inject(CRM_MOBILE_API_PORTS) private readonly ports: CrmMobileApiPorts,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Endpoint("crmChatCatalog")
  @Permissions("chats.view", "chats.send")
  async chatCatalog(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Output<"crmChatCatalog"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    let r: CrmChatProductsResult;
    try {
      r = await this.ports.chatProducts(ctx);
    } catch (err) {
      this.log.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
      return Response.json({ error: admin.mobileCatalogDown, code: "serviceUnavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
    }
    if (!r.ok) return refused(r.error);
    return { enabled: r.enabled, products: r.products };
  }

  @Endpoint("crmChatSendCatalog")
  @Permissions("chats.view", "chats.send")
  async sendCatalog(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmChatSendCatalog">,
  ): Promise<Output<"crmChatSendCatalog"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    const r = input.body.productId
      ? await this.ports.sendProduct(ctx, input.chatId, input.body.productId)
      : await this.ports.sendCatalogLink(ctx, input.chatId);
    return r.ok ? { ok: true } : refused(r.error);
  }

  @Endpoint("crmChatMessageOrder")
  @Permissions("chats.view")
  async messageOrder(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmChatMessageOrder">,
  ): Promise<Output<"crmChatMessageOrder"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    const r = await this.ports.orderItems(ctx, input.messageId);
    if (!r.ok) return refused(r.error);
    return { items: r.items, total: r.total, currency: r.currency };
  }

  @Endpoint("crmChatOpen")
  @Permissions("chats.send")
  async openChat(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmChatOpen">,
  ): Promise<Output<"crmChatOpen"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    const b = input.body;
    const r = await this.ports.openChat(ctx, {
      dealId: b.dealId ?? undefined,
      orderId: b.orderId ?? undefined,
      clientId: b.clientId ?? undefined,
      callId: b.callId ?? undefined,
    });
    if (!r.ok || !r.id) return refused(r.message ?? "Не удалось открыть чат");
    return { ok: true, id: r.id };
  }

  @Endpoint("crmChatForwardTargets")
  @Permissions("chats.view", "chats.send")
  async forwardTargets(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmChatForwardTargets">,
  ): Promise<Output<"crmChatForwardTargets">> {
    const ctx = callContext(req, this.config, staff, token, locale);
    return { targets: await this.ports.forwardTargets(ctx, input.q ?? "") };
  }

  @Endpoint("crmChatAssign")
  @Permissions("chats.view", "chats.send")
  async assignChat(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmChatAssign">,
  ): Promise<Output<"crmChatAssign">> {
    const ctx = callContext(req, this.config, staff, token, locale);
    await this.ports.assignConversation(ctx, input.chatId, input.body.userId);
    return { ok: true };
  }

  @Endpoint("crmChatCreateDeal")
  @Permissions("chats.view", "deals.edit")
  async createDealFromChat(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmChatCreateDeal">,
  ): Promise<Output<"crmChatCreateDeal">> {
    const ctx = callContext(req, this.config, staff, token, locale);
    return this.ports.createDealFromChat(ctx, input.chatId);
  }

  @Endpoint("crmChatForward")
  @Permissions("chats.view", "chats.send")
  async forwardMessages(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmChatForward">,
  ): Promise<Output<"crmChatForward"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    const failed = new Set<string>();
    let ok = 0;
    for (const messageId of input.body.messageIds) {
      const r = await this.ports.forwardMessage(ctx, input.chatId, messageId, input.body.targetIds);
      if (r.error) {
        failed.add(r.error);
        continue;
      }
      ok++;
      r.failed?.forEach((f) => failed.add(`${f.title} — ${f.error}`));
    }
    if (!ok) return refused([...failed].join("; ") || admin.mobileForwardFailed);
    return { ok: true, forwarded: ok, total: input.body.messageIds.length, failed: [...failed] };
  }

  @Endpoint("crmChatNote")
  @Permissions("chats.view")
  async sendNote(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmChatNote">,
  ): Promise<Output<"crmChatNote">> {
    const ctx = callContext(req, this.config, staff, token, locale);
    return this.ports.sendInternalNote(ctx, input.chatId, input.body.text);
  }

  @Endpoint("crmChatPin")
  @Permissions("chats.view")
  async pinChat(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmChatPin">,
  ): Promise<Output<"crmChatPin"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    return okOrRefused(await this.ports.pinChat(ctx, input.chatId, input.body.pinned));
  }

  @Endpoint("crmChatRead")
  @Permissions("chats.view")
  async markRead(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmChatRead">,
  ): Promise<Output<"crmChatRead">> {
    const ctx = callContext(req, this.config, staff, token, locale);
    await this.ports.markRead(ctx, input.chatId);
    return { ok: true };
  }

  @Endpoint("crmChatStatus")
  @Permissions("chats.view", "chats.send")
  async setStatus(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmChatStatus">,
  ): Promise<Output<"crmChatStatus">> {
    const ctx = callContext(req, this.config, staff, token, locale);
    await this.ports.setConversationStatus(ctx, input.chatId, input.body.status);
    return { ok: true };
  }

  @Endpoint("crmChatSendMessage")
  @Permissions("chats.view", "chats.send")
  async sendMessage(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmChatSendMessage">,
  ): Promise<Output<"crmChatSendMessage">> {
    const ctx = callContext(req, this.config, staff, token, locale);
    const r = await this.ports.sendMessage(ctx, input.chatId, input.body.text, input.body.override, input.body.replyToId ?? null);
    if ("blocked" in r) return { id: null, status: null, error: null, blocked: r.blocked };
    return { id: r.id, status: r.status, error: r.error, blocked: null };
  }

  @Endpoint("crmChatSendVoice")
  @Permissions("chats.view", "chats.send")
  async sendVoice(
    @CurrentStaff() staff: StaffMember,
    @Input() input: Parsed<"crmChatSendVoice">,
  ): Promise<Output<"crmChatSendVoice"> | Response> {
    const conv = await this.ports.findConversation(input.chatId);
    if (!conv) throw new ApiError(404, "notFound");
    if (!staff.context.canWork(conv.assigneeId)) throw new ApiError(403, "forbidden");
    const file = input.files[0];
    if (!file) return refused(admin.mobileEmptyRecording);
    const original = new Uint8Array(await file.arrayBuffer());
    const converted = await this.ports.convertAudio(original, "ogg");
    const upload = converted
      ? { data: converted.data, name: "voice.ogg", mime: converted.mime }
      : { data: original, name: file.name || "voice.m4a", mime: file.type || "audio/mp4" };
    const msg = await this.ports.sendUpload(conv.id, upload, "", staff.user.id, { replyToId: input.replyToId ?? null });
    return { id: msg.id, status: msg.status, error: msg.error ?? null, converted: !!converted };
  }

  @Endpoint("crmChatMessageEdit")
  @Permissions("chats.view", "chats.send")
  async editMessage(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmChatMessageEdit">,
  ): Promise<Output<"crmChatMessageEdit"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    return okOrRefused(await this.ports.editMessage(ctx, input.chatId, input.messageId, input.body.text));
  }

  @Endpoint("crmChatMessageDelete")
  @Permissions("chats.view", "chats.send")
  async deleteMessage(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmChatMessageDelete">,
  ): Promise<Output<"crmChatMessageDelete"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    return okOrRefused(await this.ports.deleteMessage(ctx, input.chatId, input.messageId));
  }

  @Endpoint("crmChatMessageResend")
  @Permissions("chats.view", "chats.send")
  async resendMessage(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmChatMessageResend">,
  ): Promise<Output<"crmChatMessageResend"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    return okOrRefused(await this.ports.resendMessage(ctx, input.chatId, input.messageId));
  }

  @Endpoint("crmChatMessageTranscribe")
  @Permissions("chats.view")
  async transcribeMessage(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmChatMessageTranscribe">,
  ): Promise<Output<"crmChatMessageTranscribe"> | Response> {
    const ctx = callContext(req, this.config, staff, token, locale);
    const r = await this.ports.transcribeMessage(ctx, input.chatId, input.messageId);
    if (r.error || r.text === undefined) return refused(r.error ?? "Не удалось расшифровать запись");
    return { text: r.text };
  }
}
