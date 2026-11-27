import { Controller, Inject, Param, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { admin } from "@/i18n/admin";
import type { Locale } from "@/i18n/config";
import type { StaffMember } from "../../core/auth/staff";
import { CurrentStaff, Permissions } from "../../core/auth/staff.decorators";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { ApiError } from "../../core/errors/api-error";
import { RequestLocale, SessionToken } from "../../core/http/decorators";
import { header } from "../../core/http/request";
import { RawBody, SiteRoute } from "../../core/http/site-route";
import { CRM_LISTS_PORTS, type CrmListsPorts } from "../crm-core/crm-core.tokens";
import { CRM_MOBILE_API_PORTS, type CrmMobileApiPorts } from "../crm-mobile-api/crm-mobile-api.tokens";
import {
  jsonWithEtag,
  measureFile,
  parseChatFilter,
  parseJsonBody,
  readVoiceMultipart,
  requireUuid,
  runMobile,
  searchParamsOf,
  siteCallContext,
  uuidSchema,
} from "./crm-mobile-site.helpers";
import { CRM_MOBILE_SITE_PORTS, type CrmMobileSitePorts } from "./crm-mobile-site.tokens";

const openChatSchema = z.object({
  dealId: z.string().uuid().nullish(),
  orderId: z.string().uuid().nullish(),
  clientId: z.string().uuid().nullish(),
  callId: z.string().uuid().nullish(),
});

const assignChatSchema = z.object({ userId: z.string().uuid().nullable() });
const catalogSendSchema = z.object({ productId: z.string().regex(/^\d{1,40}$/).nullish() });
const forwardMessagesSchema = z.object({
  messageIds: z.array(z.string()).min(1).max(30),
  targetIds: z.array(z.string()).min(1).max(10),
});
const noteBodySchema = z.object({ text: z.string().min(1).max(4000) });
const pinBodySchema = z.object({ pinned: z.boolean() });
const statusBodySchema = z.object({ status: z.enum(["open", "closed"]) });
const sendMessageSchema = z.object({
  text: z.string().max(4000),
  replyToId: z.string().uuid().nullish(),
  override: z.string().max(200).optional(),
});
const editMessageSchema = z.object({ text: z.string().min(1).max(4000) });

/**
 * Старое мобильное приложение CRM — чаты, сообщения, голосовые и потоковое аудио (19 путей, 21 HTTP-обработчик).
 * Статические маршруты (`/targets`, `/open`, `/messages/{mid}/order`, `/messages/{mid}/audio`) объявлены
 * строго раньше параметрических `/api/mobile/chats/{id}`.
 */
@Controller()
export class MobileChatsSiteController {
  constructor(
    @Inject(CRM_LISTS_PORTS) private readonly crmLists: CrmListsPorts,
    @Inject(CRM_MOBILE_API_PORTS) private readonly crmMobileApi: CrmMobileApiPorts,
    @Inject(CRM_MOBILE_SITE_PORTS) private readonly ports: CrmMobileSitePorts,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ─── Статические маршруты чатов (раньше {id}) ────────────────────────────

  @SiteRoute("GET", "/api/mobile/chats", { auth: "staff" })
  @Permissions("chats.view")
  chatsList(@Req() req: FastifyRequest, @CurrentStaff() staff: StaffMember): Promise<Response> {
    return runMobile(async () => {
      const u = searchParamsOf(req);
      const filter = parseChatFilter(u.get("f"));
      return jsonWithEtag(req, { chats: await this.crmLists.chats(staff, filter, u.get("q") ?? undefined) });
    });
  }

  @SiteRoute("GET", "/api/mobile/chats/targets", { auth: "staff" })
  @Permissions("chats.view", "chats.send")
  chatForwardTargets(
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const q = searchParamsOf(req).get("q") ?? "";
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      return Response.json({ targets: await this.crmMobileApi.forwardTargets(ctx, q) });
    });
  }

  @SiteRoute("POST", "/api/mobile/chats/open", { auth: "staff" })
  @Permissions("chats.send")
  chatOpen(
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const t = openChatSchema.parse(parseJsonBody(raw));
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      const r = await this.crmMobileApi.openChat(ctx, {
        dealId: t.dealId ?? undefined,
        orderId: t.orderId ?? undefined,
        clientId: t.clientId ?? undefined,
        callId: t.callId ?? undefined,
      });
      return Response.json(r, { status: r.ok ? 200 : 400 });
    });
  }

  @SiteRoute("GET", "/api/mobile/chats/messages/{mid}/order", { auth: "staff" })
  @Permissions("chats.view")
  chatMessageOrder(
    @Param("mid") rawMid: string,
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const mid = requireUuid(rawMid);
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      const r = await this.crmMobileApi.orderItems(ctx, mid);
      if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
      return Response.json({ items: r.items, total: r.total, currency: r.currency });
    });
  }

  /** Потоковая отдача голосового/аудио (m4a/aac/mp3) с Range 206 и ETag 304. */
  @SiteRoute("GET", "/api/mobile/chats/messages/{mid}/audio", { auth: "staff" })
  @Permissions("chats.view")
  chatMessageAudio(
    @Param("mid") rawMid: string,
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
  ): Promise<Response> {
    return measureFile("mobile-audio", () =>
      runMobile(async () => {
        const mid = requireUuid(rawMid);
        const attachment = await this.ports.findMediaAttachment(mid);
        if (!attachment) throw new ApiError(404, "notFound");
        const { assigneeId, dealId } = attachment.conversation;
        if (!staff.context.canSee(assigneeId)) {
          const deal = dealId ? await this.ports.findDealAssignee(dealId) : null;
          if (!deal || !staff.context.canSee(deal.assigneeId)) throw new ApiError(403, "forbidden");
        }
        const file = await this.ports.chatAudioFile(mid);
        if (!file) throw new ApiError(404, "notFound");
        return this.ports.serveAudioFile(
          file.path,
          file.mime,
          { range: header(req, "range"), ifNoneMatch: header(req, "if-none-match") },
          {
            "Cache-Control": "private, max-age=86400",
            "Content-Security-Policy": "sandbox",
            "X-Content-Type-Options": "nosniff",
          },
        );
      }),
    );
  }

  // ─── Диалог {id} и операции над ним ──────────────────────────────────────

  @SiteRoute("GET", "/api/mobile/chats/{id}", { auth: "staff" })
  @Permissions("chats.view")
  chatDetail(
    @Param("id") rawId: string,
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const limit = Math.min(300, Math.max(20, Number(searchParamsOf(req).get("limit")) || 50));
      return Response.json(await this.crmLists.chatDetail(staff, id, limit));
    });
  }

  @SiteRoute("POST", "/api/mobile/chats/{id}/assign", { auth: "staff" })
  @Permissions("chats.view", "chats.send")
  chatAssign(
    @Param("id") rawId: string,
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const { userId } = assignChatSchema.parse(parseJsonBody(raw));
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      await this.crmMobileApi.assignConversation(ctx, id, userId);
      return Response.json({ ok: true });
    });
  }

  @SiteRoute("POST", "/api/mobile/chats/{id}/catalog", { auth: "staff" })
  @Permissions("chats.view", "chats.send")
  chatSendCatalog(
    @Param("id") rawId: string,
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const { productId } = catalogSendSchema.parse(parseJsonBody(raw));
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      const r = productId ? await this.crmMobileApi.sendProduct(ctx, id, productId) : await this.crmMobileApi.sendCatalogLink(ctx, id);
      if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
      return Response.json({ ok: true });
    });
  }

  @SiteRoute("POST", "/api/mobile/chats/{id}/deal", { auth: "staff" })
  @Permissions("chats.view", "deals.edit")
  chatCreateDeal(
    @Param("id") rawId: string,
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      return Response.json(await this.crmMobileApi.createDealFromChat(ctx, id));
    });
  }

  @SiteRoute("POST", "/api/mobile/chats/{id}/forward", { auth: "staff" })
  @Permissions("chats.view", "chats.send")
  chatForward(
    @Param("id") rawId: string,
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const body = forwardMessagesSchema.parse(parseJsonBody(raw));
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      const failed = new Set<string>();
      let ok = 0;
      for (const messageId of body.messageIds) {
        const r = await this.crmMobileApi.forwardMessage(ctx, id, messageId, body.targetIds);
        if (r.error) {
          failed.add(r.error);
          continue;
        }
        ok++;
        r.failed?.forEach((f) => failed.add(`${f.title} — ${f.error}`));
      }
      if (!ok) return Response.json({ error: [...failed].join("; ") || admin.mobileForwardFailed }, { status: 400 });
      return Response.json({ ok: true, forwarded: ok, total: body.messageIds.length, failed: [...failed] });
    });
  }

  @SiteRoute("POST", "/api/mobile/chats/{id}/note", { auth: "staff" })
  @Permissions("chats.view")
  chatNote(
    @Param("id") rawId: string,
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const { text } = noteBodySchema.parse(parseJsonBody(raw));
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      return Response.json(await this.crmMobileApi.sendInternalNote(ctx, id, text));
    });
  }

  @SiteRoute("POST", "/api/mobile/chats/{id}/pin", { auth: "staff" })
  @Permissions("chats.view")
  chatPin(
    @Param("id") rawId: string,
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const { pinned } = pinBodySchema.parse(parseJsonBody(raw));
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      return Response.json(await this.crmMobileApi.pinChat(ctx, id, pinned));
    });
  }

  @SiteRoute("POST", "/api/mobile/chats/{id}/read", { auth: "staff" })
  @Permissions("chats.view")
  chatRead(
    @Param("id") rawId: string,
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      await this.crmMobileApi.markRead(ctx, id);
      return Response.json({ ok: true });
    });
  }

  @SiteRoute("POST", "/api/mobile/chats/{id}/status", { auth: "staff" })
  @Permissions("chats.view", "chats.send")
  chatSetStatus(
    @Param("id") rawId: string,
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const { status } = statusBodySchema.parse(parseJsonBody(raw));
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      await this.crmMobileApi.setConversationStatus(ctx, id, status);
      return Response.json({ ok: true });
    });
  }

  // ─── Лента сообщений, отправка текста и голосового, правка/удаление/повтор/расшифровка ──

  @SiteRoute("GET", "/api/mobile/chats/{id}/messages", { auth: "staff" })
  @Permissions("chats.view")
  chatMessagesList(
    @Param("id") rawId: string,
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const conv = await this.crmLists.conversation(id);
      if (!conv) throw new ApiError(404, "notFound");
      if (!staff.context.canSee(conv.assigneeId)) throw new ApiError(403, "forbidden");
      const u = searchParamsOf(req);
      const limit = Math.min(200, Math.max(10, Number(u.get("limit")) || 40));
      const rawBefore = u.get("before");
      const before = rawBefore && !Number.isNaN(Date.parse(rawBefore)) ? new Date(rawBefore) : undefined;
      return jsonWithEtag(req, { ...(await this.crmLists.chatMessages(conv.id, limit, before)), unread: conv.unread, status: conv.status });
    });
  }

  @SiteRoute("POST", "/api/mobile/chats/{id}/messages", { auth: "staff" })
  @Permissions("chats.view", "chats.send")
  chatSendMessage(
    @Param("id") rawId: string,
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const b = sendMessageSchema.parse(parseJsonBody(raw));
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      return Response.json(await this.crmMobileApi.sendMessage(ctx, id, b.text, b.override, b.replyToId ?? null));
    });
  }

  /** Голосовое сообщение клиенту (multipart: `voice`, `replyToId`) с перекодировкой в Ogg Opus. */
  @SiteRoute("POST", "/api/mobile/chats/{id}/voice", { auth: "staff" })
  @Permissions("chats.view", "chats.send")
  chatSendVoice(
    @Param("id") rawId: string,
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const conv = await this.crmMobileApi.findConversation(id);
      if (!conv) throw new ApiError(404, "notFound");
      if (!staff.context.canWork(conv.assigneeId)) throw new ApiError(403, "forbidden");
      const { voice, replyRaw } = await readVoiceMultipart(req);
      if (!voice || voice.data.length === 0) {
        return Response.json({ error: admin.mobileEmptyRecording }, { status: 400 });
      }
      const replyToId = uuidSchema.safeParse(replyRaw).success ? replyRaw : null;
      const converted = await this.crmMobileApi.convertAudio(voice.data, "ogg");
      const upload = converted
        ? { data: converted.data, name: "voice.ogg", mime: converted.mime }
        : { data: voice.data, name: voice.name || "voice.m4a", mime: voice.mime || "audio/mp4" };
      const msg = await this.crmMobileApi.sendUpload(conv.id, upload, "", staff.user.id, { replyToId });
      return Response.json({ id: msg.id, status: msg.status, error: msg.error ?? null, converted: !!converted });
    });
  }

  @SiteRoute("PATCH", "/api/mobile/chats/{id}/messages/{mid}", { auth: "staff" })
  @Permissions("chats.view", "chats.send")
  chatMessageEdit(
    @Param("id") rawId: string,
    @Param("mid") rawMid: string,
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const mid = requireUuid(rawMid);
      const { text } = editMessageSchema.parse(parseJsonBody(raw));
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      const r = await this.crmMobileApi.editMessage(ctx, id, mid, text);
      return Response.json(r, { status: r.error ? 400 : 200 });
    });
  }

  @SiteRoute("DELETE", "/api/mobile/chats/{id}/messages/{mid}", { auth: "staff" })
  @Permissions("chats.view", "chats.send")
  chatMessageDelete(
    @Param("id") rawId: string,
    @Param("mid") rawMid: string,
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const mid = requireUuid(rawMid);
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      const r = await this.crmMobileApi.deleteMessage(ctx, id, mid);
      return Response.json(r, { status: r.error ? 400 : 200 });
    });
  }

  @SiteRoute("POST", "/api/mobile/chats/{id}/messages/{mid}/resend", { auth: "staff" })
  @Permissions("chats.view", "chats.send")
  chatMessageResend(
    @Param("id") rawId: string,
    @Param("mid") rawMid: string,
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const mid = requireUuid(rawMid);
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      const r = await this.crmMobileApi.resendMessage(ctx, id, mid);
      return Response.json(r, { status: r.error ? 400 : 200 });
    });
  }

  @SiteRoute("POST", "/api/mobile/chats/{id}/messages/{mid}/transcribe", { auth: "staff" })
  @Permissions("chats.view")
  chatMessageTranscribe(
    @Param("id") rawId: string,
    @Param("mid") rawMid: string,
    @Req() req: FastifyRequest,
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
  ): Promise<Response> {
    return runMobile(async () => {
      const id = requireUuid(rawId);
      const mid = requireUuid(rawMid);
      const ctx = siteCallContext(req, this.config, staff, token, locale);
      const r = await this.crmMobileApi.transcribeMessage(ctx, id, mid);
      return Response.json(r, { status: r.error ? 400 : 200 });
    });
  }
}
