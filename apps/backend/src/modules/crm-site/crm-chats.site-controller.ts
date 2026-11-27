import { Controller, Inject, Param, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { Locale } from "@/i18n/config";
import { CHAT_FILTERS, type ChatFilter } from "@/lib/crm/inbox-model";
import { GowaError, MediaUnavailableError, MessageActionError, sensitiveWhat } from "@/modules/messaging";
import type { StaffMember } from "../../core/auth/staff";
import { CurrentStaff, Permissions } from "../../core/auth/staff.decorators";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { ApiError } from "../../core/errors/api-error";
import { RequestLocale, SessionToken } from "../../core/http/decorators";
import { header } from "../../core/http/request";
import { SiteRoute } from "../../core/http/site-route";
import {
  callContext,
  formFiles,
  formText,
  measureFile,
  MultipartFilesLimitError,
  readMultipartForm,
  requireUuid,
  uuidSchema,
} from "./crm-site.helpers";
import { CRM_SITE_PORTS, type CrmSitePorts } from "./crm-site.tokens";

/** Максимум файлов за одну отправку из чата CRM. */
const MAX_CHAT_FILES = 10;

/** Один диапазон байтов от браузера для потокового вложения WhatsApp (без списков и мусора). */
const MEDIA_RANGE = /^bytes=\d{0,15}-\d{0,15}$/;

function isChatFilter(value: string): value is ChatFilter {
  return Object.hasOwn(CHAT_FILTERS, value);
}

/**
 * 7 маршрутов сайта CRM для чатов и подборки материалов AI-продажника:
 * инбокс `/api/admin/chats/inbox`, сообщения `/api/admin/chats/{id}/messages`,
 * отправка файлов `/api/admin/chats/{id}/files`, голосовых `/api/admin/chats/{id}/voice`,
 * поток вложений `/api/admin/chats/messages/{id}/media`, загрузка и превью материалов бота
 * `/api/admin/bot/materials` и `/api/admin/bot/materials/{id}`.
 */
@Controller()
export class CrmChatsSiteController {
  constructor(
    @Inject(CRM_SITE_PORTS) private readonly ports: CrmSitePorts,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @SiteRoute("GET", "/api/admin/chats/inbox", { auth: "staff" })
  @Permissions("chats.view")
  async inbox(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const sp = new URL(req.url, "http://localhost").searchParams;
    const raw = sp.get("f") ?? "open";
    const f: ChatFilter = isChatFilter(raw) ? raw : "open";
    const q = sp.get("q")?.trim().slice(0, 200) || undefined;
    const items = await this.ports.chatsInbox(callContext(req, this.config, staff, token, locale), { f, q });
    return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
  }

  @SiteRoute("POST", "/api/admin/chats/{id}/files", { auth: "staff" })
  @Permissions("chats.view", "chats.send")
  async uploadFiles(
    @Param("id") rawId: string,
    @CurrentStaff() staff: StaffMember,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const conv = await this.ports.findConversation(id);
    if (!conv) throw new ApiError(404, "notFound");
    if (!staff.context.canWork(conv.assigneeId)) throw new ApiError(403, "forbidden");
    let form;
    try {
      form = await readMultipartForm(req);
    } catch (err) {
      if (err instanceof MultipartFilesLimitError) {
        return Response.json({ error: `Не больше ${MAX_CHAT_FILES} файлов за раз` }, { status: 400 });
      }
      throw err;
    }
    const files = formFiles(form, "files");
    if (!files.length) return Response.json({ error: "Выберите файл" }, { status: 400 });
    if (files.length > MAX_CHAT_FILES) return Response.json({ error: `Не больше ${MAX_CHAT_FILES} файлов за раз` }, { status: 400 });
    const caption = formText(form, "caption").slice(0, 1000);
    const findings = await this.ports.sensitiveFor(conv, caption);
    if (findings.length) throw new ApiError(400, "sensitiveCaption", sensitiveWhat(findings));
    const replyRaw = formText(form, "replyToId");
    const replyToId = uuidSchema.safeParse(replyRaw).success ? replyRaw : null;
    const results: Array<{ name: string; id?: string; status?: string; error?: string }> = [];
    for (const [i, f] of files.entries()) {
      try {
        const msg = await this.ports.sendChatUpload(
          conv.id,
          { data: new Uint8Array(f.data), name: f.name, mime: f.mime },
          i === 0 ? caption : "",
          staff.user.id,
          { replyToId: i === 0 ? replyToId : null },
        );
        results.push({ name: f.name, id: msg.id, status: msg.status, ...(msg.error ? { error: msg.error } : {}) });
      } catch (err) {
        if (!MessageActionError.is(err)) throw err;
        results.push({ name: f.name, error: err.message });
      }
    }
    return Response.json({ results });
  }

  @SiteRoute("GET", "/api/admin/chats/{id}/messages", { auth: "staff" })
  @Permissions("chats.view")
  async messages(
    @Param("id") rawId: string,
    @CurrentStaff() staff: StaffMember,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const conv = await this.ports.findConversation(id);
    if (!conv || !staff.context.canSee(conv.assigneeId)) throw new ApiError(404, "notFound");
    const sp = new URL(req.url, "http://localhost").searchParams;
    const limit = Math.min(200, Math.max(10, Number(sp.get("limit")) || 60));
    const raw = sp.get("before");
    const before = raw && !Number.isNaN(Date.parse(raw)) ? new Date(raw) : undefined;
    const messages = await this.ports.chatMessages(conv.id, limit, before);
    return Response.json({ messages, more: messages.length === limit }, { headers: { "Cache-Control": "no-store" } });
  }

  @SiteRoute("POST", "/api/admin/chats/{id}/voice", { auth: "staff" })
  @Permissions("chats.view", "chats.send")
  async uploadVoice(
    @Param("id") rawId: string,
    @CurrentStaff() staff: StaffMember,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const conv = await this.ports.findConversation(id);
    if (!conv) throw new ApiError(404, "notFound");
    if (!staff.context.canWork(conv.assigneeId)) throw new ApiError(403, "forbidden");
    const form = await readMultipartForm(req);
    const file = formFiles(form, "voice")[0];
    if (!file) return Response.json({ error: "Запись пустая" }, { status: 400 });
    const replyRaw = formText(form, "replyToId");
    const replyToId = uuidSchema.safeParse(replyRaw).success ? replyRaw : null;
    const original = new Uint8Array(file.data);
    const converted = await this.ports.convertAudio(original, "ogg");
    const ext = /mp4|aac/.test(file.mime) ? "m4a" : /ogg/.test(file.mime) ? "ogg" : "webm";
    const upload = converted
      ? { data: converted.data, name: "voice.ogg", mime: converted.mime }
      : { data: original, name: `voice.${ext}`, mime: file.mime || "audio/webm" };
    try {
      const msg = await this.ports.sendChatUpload(conv.id, upload, "", staff.user.id, { replyToId });
      return Response.json({ id: msg.id, status: msg.status, error: msg.error ?? null, converted: !!converted });
    } catch (err) {
      if (!MessageActionError.is(err)) throw err;
      return Response.json({ error: err.message }, { status: 400 });
    }
  }

  @SiteRoute("GET", "/api/admin/chats/messages/{id}/media", { auth: "staff" })
  @Permissions("chats.view")
  messageMedia(
    @Param("id") rawId: string,
    @CurrentStaff() staff: StaffMember,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    return measureFile("wa-media", async () => {
      const id = requireUuid(rawId);
      const attachment = await this.ports.findMessageMedia(id);
      if (!attachment) throw new ApiError(404, "notFound");
      const { assigneeId, dealId } = attachment.conversation;
      if (!staff.context.canSee(assigneeId)) {
        const deal = dealId ? await this.ports.findDealById(dealId) : null;
        if (!deal || !staff.context.canSee(deal.assigneeId)) throw new ApiError(403, "forbidden");
      }
      const range = header(req, "range");
      const validRange = range && MEDIA_RANGE.test(range) && range !== "bytes=-" ? range : null;
      let file;
      try {
        file = await this.ports.openMessageMedia(attachment, validRange);
      } catch (err) {
        if (GowaError.is(err) || MediaUnavailableError.is(err)) {
          return new Response(err.message, { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } });
        }
        throw err;
      }
      if (!file) throw new ApiError(404, "notFound");
      return new Response(file.body, {
        status: file.range ? 206 : 200,
        headers: {
          "Content-Type": file.contentType ?? "application/octet-stream",
          ...(file.size ? { "Content-Length": file.size } : {}),
          ...(file.range ? { "Content-Range": file.range } : {}),
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=86400",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "sandbox",
        },
      });
    });
  }

  @SiteRoute("POST", "/api/admin/bot/materials", { auth: "staff" })
  @Permissions("settings.manage")
  async addBotMaterial(@CurrentStaff() staff: StaffMember, @Req() req: FastifyRequest): Promise<Response> {
    const form = await readMultipartForm(req);
    const file = formFiles(form, "file")[0];
    if (!file) return Response.json({ error: "Выберите файл" }, { status: 400 });
    const rawLang = formText(form, "lang") || "any";
    const lang = rawLang === "ru" || rawLang === "kk" ? rawLang : "any";
    try {
      const material = await this.ports.addBotMaterial(
        { data: new Uint8Array(file.data), name: file.name, mime: file.mime },
        { caption: formText(form, "caption"), about: formText(form, "about"), lang },
        staff.user.id,
      );
      await this.ports.audit(staff, "settings.update", "settings", "bot.materials", { added: material.name, kind: material.kind });
      return Response.json({ material });
    } catch (err) {
      if (!MessageActionError.is(err)) throw err;
      return Response.json({ error: err.message }, { status: 400 });
    }
  }

  @SiteRoute("GET", "/api/admin/bot/materials/{id}", { auth: "staff" })
  @Permissions("settings.manage")
  async botMaterialPreview(@Param("id") id: string): Promise<Response> {
    const file = await this.ports.botMaterialFile(id.slice(0, 40));
    if (!file) throw new ApiError(404, "notFound");
    const { data, material } = file;
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": material.mime,
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(material.name)}`,
      },
    });
  }
}
