import { Controller, Inject, Param, Req, Res } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { BoardsError, boardsErrorStatus } from "@/modules/boards";
import { SupportError, type UploadedFile } from "@/modules/support";
import type { StaffMember } from "../../core/auth/staff";
import { CurrentStaff } from "../../core/auth/staff.decorators";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { ApiError } from "../../core/errors/api-error";
import { RequestLocale, SessionToken } from "../../core/http/decorators";
import { header } from "../../core/http/request";
import { RawBody, SiteRoute } from "../../core/http/site-route";
import {
  boardViewerOf,
  buildWebRequest,
  callContext,
  createRequestAbort,
  formFiles,
  formText,
  measureFile,
  parseJsonText,
  readMultipartForm,
  requireUuid,
  safeParseJson,
  uuidSchema,
} from "./crm-site.helpers";
import { CRM_SITE_PORTS, type CrmSitePorts } from "./crm-site.tokens";

const SUPPORT_ATT_ID = /^[a-z0-9-]{1,40}$/;

const releaseBodySchema = z.object({
  release: z.string().max(120),
  commits: z
    .array(
      z.object({
        sha: z.string().regex(/^[0-9a-f]{7,40}$/),
        subject: z.string().max(1000),
        body: z.string().max(10_000).optional(),
      }),
    )
    .max(500),
});

function boardsPathOf(url: string): string[] {
  const pathname = new URL(url, "http://localhost").pathname;
  const tail = pathname.replace(/^\/api\/v1\/site\//, "/api/").replace(/^\/api\/admin\/boards\/?/, "");
  if (!tail) return [];
  try {
    return tail.split("/").map((s) => decodeURIComponent(s));
  } catch {
    throw new ApiError(400, "badRequest");
  }
}

/**
 * 5 маршрутов сайта CRM для досок задач, вложений карточек и обращений поддержки:
 * `/api/admin/boards/{path*}` (GET/POST/PATCH/PUT/DELETE),
 * `/api/admin/tasks/{id}/files/{att}` (GET),
 * `/api/admin/support` (POST),
 * `/api/admin/support/{id}/files/{att}` (GET),
 * `/api/support/release` (POST, auth: "none" со своим секретом `X-Release-Token`).
 */
@Controller()
export class CrmBoardsSupportSiteController {
  constructor(
    @Inject(CRM_SITE_PORTS) private readonly ports: CrmSitePorts,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private async dispatchBoards(
    staff: StaffMember,
    token: string | null,
    locale: Locale,
    req: FastifyRequest,
    raw: Buffer,
  ): Promise<Response> {
    const segments = boardsPathOf(req.url);
    const webReq = await buildWebRequest(req, raw, this.config.appUrl);
    return this.ports.boardsDispatch(callContext(req, this.config, staff, token, locale), webReq, segments);
  }

  @SiteRoute("GET", "/api/admin/boards/{path*}", { auth: "staff" })
  boardsGet(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
  ): Promise<Response> {
    return this.dispatchBoards(staff, token, locale, req, raw);
  }

  @SiteRoute("POST", "/api/admin/boards/{path*}", { auth: "staff" })
  boardsPost(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
  ): Promise<Response> {
    return this.dispatchBoards(staff, token, locale, req, raw);
  }

  @SiteRoute("PATCH", "/api/admin/boards/{path*}", { auth: "staff" })
  boardsPatch(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
  ): Promise<Response> {
    return this.dispatchBoards(staff, token, locale, req, raw);
  }

  @SiteRoute("PUT", "/api/admin/boards/{path*}", { auth: "staff" })
  boardsPut(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
  ): Promise<Response> {
    return this.dispatchBoards(staff, token, locale, req, raw);
  }

  @SiteRoute("DELETE", "/api/admin/boards/{path*}", { auth: "staff" })
  boardsDelete(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Req() req: FastifyRequest,
    @RawBody() raw: Buffer,
  ): Promise<Response> {
    return this.dispatchBoards(staff, token, locale, req, raw);
  }

  @SiteRoute("GET", "/api/admin/tasks/{id}/files/{att}", { auth: "staff" })
  async taskAttachment(
    @Param("id") rawId: string,
    @Param("att") rawAtt: string,
    @CurrentStaff() staff: StaffMember,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const att = requireUuid(rawAtt);
    let attachment;
    try {
      attachment = await this.ports.boardCardFile(boardViewerOf(staff), id, att);
    } catch (err) {
      if (BoardsError.is(err)) return Response.json({ error: err.message }, { status: boardsErrorStatus(err.code) });
      throw err;
    }
    const download = new URL(req.url, "http://localhost").searchParams.get("download") === "1";
    const name = encodeURIComponent(attachment.name);
    const { signal, cleanup } = createRequestAbort(req, reply);
    try {
      const res = await this.ports.serveBoardFile(
        attachment.storageKey,
        attachment.mime || "application/octet-stream",
        { range: header(req, "range"), ifNoneMatch: header(req, "if-none-match"), signal },
        {
          "Cache-Control": "private, max-age=3600",
          "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${name}`,
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; media-src 'self'",
        },
      );
      if (!res) throw new ApiError(404, "notFound");
      return res;
    } finally {
      cleanup();
    }
  }

  @SiteRoute("POST", "/api/admin/support", { auth: "staff" })
  async createSupport(@CurrentStaff() staff: StaffMember, @Req() req: FastifyRequest): Promise<Response> {
    let form;
    try {
      form = await readMultipartForm(req);
    } catch {
      return Response.json({ error: "Не удалось прочитать форму — возможно, файлы слишком большие" }, { status: 400 });
    }
    const uploads: UploadedFile[] = [];
    for (const [key, recorded] of [
      ["voice", true],
      ["files", false],
    ] as const) {
      for (const f of formFiles(form, key)) {
        uploads.push({
          name: f.name || (recorded ? "голосовое.webm" : "файл"),
          mime: f.mime,
          data: f.data,
          recorded,
        });
      }
    }
    const name = staff.user.name || staff.user.email;
    const conversationId = formText(form, "conversationId");
    let messageIds: string[] = [];
    if (conversationId) {
      if (!staff.context.can("chats.view")) throw new ApiError(403, "forbidden");
      const convId = uuidSchema.parse(conversationId);
      const conv = await this.ports.findConversation(convId);
      if (!conv || !staff.context.canSee(conv.assigneeId)) {
        return Response.json({ error: "Этот чат вам недоступен" }, { status: 403 });
      }
      messageIds = z.array(uuidSchema).max(200).parse(parseJsonText(formText(form, "messageIds") || "[]"));
    }
    try {
      const ticket = await this.ports.createSupportTicket(
        {
          kind: formText(form, "kind"),
          urgency: formText(form, "urgency"),
          description: formText(form, "description"),
          place: formText(form, "place"),
          expected: formText(form, "expected"),
          reporterName: name,
          notifyPhone: formText(form, "notifyPhone") || staff.user.phone || "",
          clientPhone: formText(form, "clientPhone"),
          device: formText(form, "device"),
          userAgent: header(req, "user-agent") ?? "",
        },
        uploads,
        { userId: staff.user.id, name },
        { chatMessages: messageIds.length },
      );
      if (conversationId && messageIds.length) {
        await this.ports.linkSupportChat(ticket.id, conversationId, messageIds, { userId: staff.user.id, name });
      }
      // Обработка вложений и AI-разбор выполняются после ответа через безопасный планировщик (без `after()` из Next).
      this.ports.scheduleBackground(() =>
        this.ports.processSupportTicket(ticket.id).catch((err) => console.error("[support] process", err)),
      );
      return Response.json({ number: ticket.number, phone: ticket.notifyPhone });
    } catch (err) {
      if (SupportError.is(err)) return Response.json({ error: err.message }, { status: 400 });
      throw err;
    }
  }

  @SiteRoute("GET", "/api/admin/support/{id}/files/{att}", { auth: "staff" })
  supportAttachment(
    @Param("id") rawId: string,
    @Param("att") att: string,
    @CurrentStaff() staff: StaffMember,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Response> {
    return measureFile("support-file", async () => {
      const id = requireUuid(rawId);
      if (!SUPPORT_ATT_ID.test(att)) throw new ApiError(404, "notFound");
      const ticket = await this.ports.findSupportTicket(id);
      const canOpen =
        !!ticket && (staff.context.can("settings.manage") || (!!ticket.createdBy && ticket.createdBy === staff.user.id));
      if (!canOpen) throw new ApiError(404, "notFound");
      const attachment = await this.ports.findSupportAttachment(id, att);
      if (!attachment) throw new ApiError(404, "notFound");
      const download = new URL(req.url, "http://localhost").searchParams.has("download");
      const name = encodeURIComponent(attachment.name);
      const { signal, cleanup } = createRequestAbort(req, reply);
      try {
        const res = await this.ports.serveSupportAttachment(
          attachment,
          { range: header(req, "range"), ifNoneMatch: header(req, "if-none-match"), signal },
          {
            "Cache-Control": "private, max-age=3600",
            "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${name}`,
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; media-src 'self'",
          },
        );
        if (!res) throw new ApiError(404, "notFound");
        return res;
      } finally {
        cleanup();
      }
    });
  }

  @SiteRoute("POST", "/api/support/release", { auth: "none" })
  async supportRelease(@Req() req: FastifyRequest, @RawBody() raw: Buffer): Promise<Response> {
    if (!this.ports.isReleaseTokenValid(header(req, "x-release-token"))) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    const parsed = releaseBodySchema.safeParse(safeParseJson(raw, null));
    if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
    const tickets = await this.ports.markSupportReleased(parsed.data);
    return Response.json({ tickets });
  }
}
