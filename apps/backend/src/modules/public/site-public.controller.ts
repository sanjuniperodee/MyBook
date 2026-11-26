import { Controller, Inject, Param, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { LOCALE_HEADER, localizePath } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import type { PhotoChange } from "@/modules/feedback";
import type { RateLimiter } from "@/shared/application/RateLimiter";
import { randomToken } from "@/shared/crypto";
import { INVITE_CAMPAIGN_PREFIX, SOURCE_COOKIE, VISITOR_COOKIE } from "@/shared/domain/links";
import { INVITE_COOKIE } from "@/shared/domain/orders";
import { normalizePhone } from "@/shared/domain/phone";
import { countPerf } from "@/shared/infrastructure/perfLog";
import { originAllowed } from "@/shared/origin";
import {
  buildInviteSourceCookie,
  hasCookieNamed,
  INVITE_CODE_RE,
  INVITE_COOKIE_MAX_AGE,
  letterSubmitSchema,
  REVIEW_SUBMIT_BODY_MAX,
  reviewSubmitFormSchema,
  serializeSetCookie,
  siteCallbackSchema,
  siteChatPostSchema,
  SOURCE_COOKIE_MAX_AGE,
  UUID_RE,
  VISITOR_COOKIE_MAX_AGE,
  VISITOR_TOKEN_RE,
} from "@/shared/public-routes";
import { STAFF_ACCESS, type StaffAccessPort } from "../../core/auth/staff";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { ApiError } from "../../core/errors/api-error";
import { clientIp } from "../../core/http/client-ip";
import { SessionToken } from "../../core/http/decorators";
import { cookie, header } from "../../core/http/request";
import { RawBody, SiteRoute } from "../../core/http/site-route";
import { RATE_LIMITER } from "../../core/kernel/tokens";
import { PublicService } from "./public.service";
import { PUBLIC_PORTS, type PublicPorts } from "./public.tokens";

function parseJsonBody(raw: Buffer): unknown {
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    throw new ApiError(400, "badRequest");
  }
}

async function readReviewForm(req: FastifyRequest, raw: Buffer): Promise<{ fields: Map<string, string>; photo: Buffer | null }> {
  const fields = new Map<string, string>();
  let photo: Buffer | null = null;
  let seenPhoto = false;
  if (req.isMultipart()) {
    for await (const part of req.parts()) {
      if (part.type === "file") {
        if (part.fieldname === "photo" && !seenPhoto) {
          seenPhoto = true;
          const buf = await part.toBuffer();
          if (buf.length > 0) photo = buf;
        } else {
          // Невостребованный файл дочитываем вхолостую, чтобы поток multipart не завис.
          part.file.resume();
        }
      } else if (!fields.has(part.fieldname)) {
        fields.set(part.fieldname, typeof part.value === "string" ? part.value : String(part.value ?? ""));
      }
    }
    return { fields, photo };
  }
  const contentType = header(req, "content-type")?.toLowerCase() ?? "";
  if (contentType.startsWith("application/x-www-form-urlencoded")) {
    for (const [k, v] of new URLSearchParams(raw.toString("utf8"))) {
      if (!fields.has(k)) fields.set(k, v);
    }
    return { fields, photo: null };
  }
  throw new TypeError("Unsupported form content-type");
}

async function measureFile(name: string, fn: () => Promise<Response>): Promise<Response> {
  const t0 = performance.now();
  const res = await fn();
  countPerf(`route:${name}`, Number(res.headers.get("content-length") ?? 0), performance.now() - t0, res.status);
  return res;
}

function redirectResponse(target: string | URL, status: number, extraHeaders?: Record<string, string>): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Location", new URL(String(target)).toString());
  return new Response(null, { status, headers });
}

/**
 * 10 публичных маршрутов сайта (`@SiteRoute`, работают по `/api/...` и `/api/v1/site/...`):
 * PDF сертификата, письмо близких, фото и отправка отзыва, обратный звонок и онлайн-чат,
 * iCal-лента, аватар WhatsApp, реферальная ссылка `/r/{code}` и короткая ссылка `/go/{slug}`.
 * Статические сегменты (`/reviews/photo/{id}`, `/chat/callback`) объявлены раньше параметрических.
 */
@Controller()
export class SitePublicController {
  constructor(
    @Inject(PUBLIC_PORTS) private readonly ports: PublicPorts,
    @Inject(PublicService) private readonly service: PublicService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    @Inject(STAFF_ACCESS) private readonly staffAccess: StaffAccessPort,
  ) {}

  @SiteRoute("GET", "/api/gifts/{token}/pdf", { auth: "none" })
  giftPdf(@Param("token") token: string): Promise<Response> {
    return measureFile("gift-pdf", async () => {
      const found = await this.ports.giftPdf(token);
      if (!found || found.gift.status !== "paid") return new Response(null, { status: 404 });
      const { gift, pdf } = found;
      return new Response(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${messagesFor(gift.locale).gift.card.filename(gift.number)}"`,
          "Cache-Control": "private, no-store",
        },
      });
    });
  }

  @SiteRoute("POST", "/api/letters/{token}", { auth: "none" })
  async letterSubmit(@Param("token") token: string, @RawBody() raw: Buffer, @Req() req: FastifyRequest): Promise<Response> {
    const body = letterSubmitSchema.parse(parseJsonBody(raw));
    const ip = clientIp(req, this.config.edgeIpSecret);
    if (!(await this.limiter.hit(`letter:${ip}`, 5, 3_600_000))) throw new ApiError(429, "letterRate");
    await this.ports.submitLetter(token, body);
    return Response.json({ ok: true });
  }

  @SiteRoute("GET", "/api/reviews/photo/{id}", { auth: "none" })
  reviewPhoto(
    @Param("id") id: string,
    @SessionToken() sessionTok: string | null,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    return measureFile("review-photo", async () => {
      if (!UUID_RE.test(id)) return new Response(null, { status: 404 });
      const photo = await this.ports.reviewPhoto(id);
      if (!photo) return new Response(null, { status: 404 });
      if (!photo.published) {
        const user = await this.service.optionalUser(sessionTok);
        if (!user) return new Response(null, { status: 404 });
        if (user.id !== photo.userId) {
          const staff = await this.staffAccess.resolve(user, clientIp(req, this.config.edgeIpSecret));
          if (!staff || staff.gate !== null || !staff.context.can("reviews.manage")) {
            return new Response(null, { status: 404 });
          }
        }
      }
      const data = await this.ports.reviewPhotoFile(photo.key);
      return new Response(new Uint8Array(data), {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": photo.published ? "public, max-age=86400" : "private, no-store",
        },
      });
    });
  }

  @SiteRoute("POST", "/api/reviews/{orderId}", { auth: "none" })
  async reviewSubmit(
    @Param("orderId") orderId: string,
    @SessionToken() sessionTok: string | null,
    @RawBody() raw: Buffer,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    // Порядок проверок как на сайте: UUID параметра → Origin (CSRF) → лимит → размер → форма → доступ → поля → сохранение.
    if (!UUID_RE.test(orderId)) throw new ApiError(400, "badRequest");
    const host = header(req, "x-forwarded-host") ?? header(req, "host");
    if (!originAllowed({ method: req.method, origin: header(req, "origin"), host }, this.config.appUrl)) {
      throw new ApiError(403, "forbidden");
    }
    const ip = clientIp(req, this.config.edgeIpSecret);
    if (!(await this.limiter.hit(`review:${ip}`, 20, 3_600_000))) throw new ApiError(429, "reviewRate");
    if (Number(header(req, "content-length") ?? 0) > REVIEW_SUBMIT_BODY_MAX) throw new ApiError(413, "reviewPhotoInvalid");

    const { fields, photo: photoBuf } = await readReviewForm(req, raw);
    const token = fields.get("t") ?? null;
    if (!(await this.service.canReviewOrder(orderId, token, sessionTok))) throw new ApiError(404, "reviewNotFound");

    const field = (k: string) => fields.get(k) ?? "";
    const input = reviewSubmitFormSchema.parse({
      rating: field("rating"),
      text: field("text"),
      authorName: field("authorName"),
      city: field("city"),
      consent: field("consent") || "0",
    });
    const photo: PhotoChange = photoBuf ? { file: photoBuf } : field("removePhoto") === "1" ? "remove" : "keep";
    const review = await this.ports.submitReview(orderId, input, photo);
    return Response.json({ status: review.status, thankYouCode: review.thankYouCode, hasPhoto: review.hasPhoto });
  }

  @SiteRoute("POST", "/api/chat/callback", { auth: "none", csrf: true })
  async siteCallback(
    @SessionToken() sessionTok: string | null,
    @RawBody() raw: Buffer,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    if (!(await this.ports.widgetConfig()).enabled) throw new ApiError(403, "widgetOff");
    const body = siteCallbackSchema.parse(parseJsonBody(raw));
    if (normalizePhone(body.phone).length < 10) throw new ApiError(400, "widgetPhone");
    const ip = clientIp(req, this.config.edgeIpSecret);
    if (!(await this.limiter.hit(`callback:${ip}`, 5, 3_600_000))) throw new ApiError(429, "widgetRate");
    const user = await this.service.optionalUser(sessionTok);
    await this.ports.requestCallback({ ...body, userId: user?.role === "user" ? user.id : null });
    return Response.json({ ok: true });
  }

  @SiteRoute("GET", "/api/chat", { auth: "none" })
  async siteChatGet(@Req() req: FastifyRequest): Promise<Response> {
    const token = cookie(req, VISITOR_COOKIE);
    if (!token) return Response.json({ messages: [] });
    const after = new URL(req.url, "http://localhost").searchParams.get("after");
    const at = after ? new Date(after) : undefined;
    const messages = await this.ports.siteMessages(token, at && !Number.isNaN(at.getTime()) ? at : undefined);
    return Response.json({ messages }, { headers: { "cache-control": "no-store" } });
  }

  @SiteRoute("POST", "/api/chat", { auth: "none", csrf: true })
  async siteChatPost(
    @SessionToken() sessionTok: string | null,
    @RawBody() raw: Buffer,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    if (!(await this.ports.widgetConfig()).chat) throw new ApiError(403, "widgetOff");
    const body = siteChatPostSchema.parse(parseJsonBody(raw));
    const existing = cookie(req, VISITOR_COOKIE);
    const ip = clientIp(req, this.config.edgeIpSecret);
    if (
      !(await this.limiter.hit(`site-chat:${ip}`, 30, 600_000)) ||
      (existing && !(await this.limiter.hit(`site-chat:${existing}`, 20, 300_000)))
    ) {
      throw new ApiError(429, "widgetRate");
    }
    const fresh = !existing || !VISITOR_TOKEN_RE.test(existing);
    const token = fresh ? randomToken() : existing;
    const user = await this.service.optionalUser(sessionTok);
    await this.ports.postSiteChat({
      token,
      text: body.text,
      name: body.name,
      phone: body.phone,
      page: body.page,
      userId: user?.role === "user" ? user.id : null,
      userName: user?.name,
    });
    const headers = new Headers({ "content-type": "application/json" });
    if (fresh) {
      headers.append(
        "set-cookie",
        serializeSetCookie(VISITOR_COOKIE, token, {
          path: "/",
          maxAge: VISITOR_COOKIE_MAX_AGE,
          secure: this.config.appUrl.startsWith("https://"),
          httpOnly: true,
          sameSite: "lax",
        }),
      );
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  }

  @SiteRoute("GET", "/api/calendar/{token}", { auth: "none" })
  async calendarFeed(@Param("token") rawToken: string): Promise<Response> {
    const token = rawToken.replace(/\.ics$/i, "");
    const ics = await this.ports.calendarFeed(token);
    if (!ics) return new Response("Not found", { status: 404 });
    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": 'inline; filename="mybooks-crm.ics"',
      },
    });
  }

  @SiteRoute("GET", "/api/chat-avatar/{file}", { auth: "none" })
  async chatAvatar(@Param("file") file: string): Promise<Response> {
    const data = await this.ports.chatAvatarFile(file);
    if (!data) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  @SiteRoute("GET", "/api/r/{code}", { auth: "none" })
  async inviteLink(@Param("code") code: string, @Req() req: FastifyRequest): Promise<Response> {
    const home = localizePath("/", header(req, LOCALE_HEADER) === "kk" ? "kk" : "ru");
    const plain = () => redirectResponse(new URL(home, this.config.appUrl), 302, { "Cache-Control": "no-store" });
    const ip = clientIp(req, this.config.edgeIpSecret);
    if (!INVITE_CODE_RE.test(code) || !(await this.limiter.hit(`invite:${ip}`, 60, 600_000))) return plain();
    const welcome = await this.ports.inviteWelcome(code);
    if (!welcome) return plain();

    const landing = new URL(home, this.config.appUrl);
    landing.searchParams.set("utm_campaign", `${INVITE_CAMPAIGN_PREFIX}${welcome.code}`);
    const nowMs = Date.now();
    const headers = new Headers({
      Location: landing.toString(),
      "Cache-Control": "no-store",
    });
    headers.append(
      "set-cookie",
      serializeSetCookie(
        INVITE_COOKIE,
        welcome.code,
        {
          path: "/",
          maxAge: INVITE_COOKIE_MAX_AGE,
          secure: this.config.appUrl.startsWith("https://"),
          httpOnly: true,
          sameSite: "lax",
        },
        nowMs,
      ),
    );
    if (!hasCookieNamed(header(req, "cookie"), SOURCE_COOKIE)) {
      headers.append(
        "set-cookie",
        serializeSetCookie(
          SOURCE_COOKIE,
          buildInviteSourceCookie(welcome.code, new Date(nowMs)),
          {
            path: "/",
            maxAge: SOURCE_COOKIE_MAX_AGE,
            httpOnly: true,
            sameSite: "lax",
          },
          nowMs,
        ),
      );
    }
    return new Response(null, { status: 302, headers });
  }

  @SiteRoute("GET", "/api/go/{slug}", { auth: "none" })
  async shortLink(@Param("slug") slug: string, @Req() req: FastifyRequest): Promise<Response> {
    const target = await this.ports.followShortLink(slug, header(req, "user-agent") ?? "");
    if (!target) return redirectResponse(this.config.appUrl, 302);
    return redirectResponse(target, 302, { "Cache-Control": "no-store" });
  }
}
