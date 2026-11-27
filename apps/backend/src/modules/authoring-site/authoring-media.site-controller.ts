import { Controller, Inject, Param, Req, Res } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { getAiPack } from "@/config/site";
import { FILE_TOKEN } from "@/lib/book/answer-files";
import { youtubeId } from "@/lib/book/answer-media";
import { fontFiles } from "@/lib/book/fonts";
import type { CurrentUser as AuthUser } from "@/modules/identity";
import { isCoverPhotoKey } from "@/modules/production";
import type { RateLimiter } from "@/shared/application/RateLimiter";
import { CurrentUser } from "../../core/auth/current-user.decorator";
import { ApiError } from "../../core/errors/api-error";
import { header } from "../../core/http/request";
import { RawBody, SiteRoute } from "../../core/http/site-route";
import { RATE_LIMITER } from "../../core/kernel/tokens";
import { AUTHORING, type AuthoringFacade } from "../authoring/authoring.tokens";
import { createRequestAbort, measureFile, parseJsonBody, requireUuid, SiteBookAccessService } from "./authoring-site.helpers";
import { AUTHORING_SITE_PORTS, type AuthoringSitePorts } from "./authoring-site.tokens";

const aiPackSchema = z.object({ packId: z.string().max(20) });
const COVER_PHOTO_WIDTHS = [480, 900, 1600, 2400];

/**
 * 7 медиа- и ресурсных маршрутов сайта Authoring:
 * свой QR-файл `/api/v/{token}`, покупка пакетов ИИ-дизайнера `/api/design-ai/packs`,
 * oEmbed YouTube `/api/media/oembed`, шрифты `/api/fonts/{file}`,
 * потоковые фото книги `/api/photos/{id}`, фоны обложек `/api/covers/{file}` и снимки шаблонов `/api/cover-photos/{key}`.
 */
@Controller()
export class AuthoringMediaSiteController {
  constructor(
    @Inject(AUTHORING) private readonly authoring: AuthoringFacade,
    @Inject(AUTHORING_SITE_PORTS) private readonly ports: AuthoringSitePorts,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    @Inject(SiteBookAccessService) private readonly access: SiteBookAccessService,
  ) {}

  @SiteRoute("GET", "/api/v/{token}", { auth: "none" })
  answerFileStream(
    @Param("token") token: string,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Response> {
    return measureFile("answer-file", async () => {
      if (!FILE_TOKEN.test(token)) throw new ApiError(404, "fileNotFound");
      const file = await this.ports.findAnswerFileByToken(token);
      if (!file || file.status !== "ready") throw new ApiError(404, "fileNotFound");
      const q = new URL(req.url, "http://localhost").searchParams;
      const headers: Record<string, string> = {
        "Cache-Control": "public, max-age=604800",
        "X-Robots-Tag": "noindex",
        "Cross-Origin-Resource-Policy": "same-site",
      };
      const { signal, cleanup } = createRequestAbort(req, reply);
      const streamReq = { range: header(req, "range"), ifNoneMatch: header(req, "if-none-match"), signal };
      try {
        if (q.get("poster")) {
          if (!file.hasPoster) throw new ApiError(404, "fileNotFound");
          const poster = await this.ports.serveAnswerPoster(file, streamReq, headers);
          if (!poster) throw new ApiError(404, "fileNotFound");
          return poster;
        }
        const ext = file.kind === "video" ? "mp4" : "m4a";
        if (q.get("download")) headers["Content-Disposition"] = `attachment; filename="mybooks-${token}.${ext}"`;
        const media = await this.ports.serveAnswerMedia(file, streamReq, headers);
        if (!media) throw new ApiError(404, "fileNotFound");
        return media;
      } finally {
        cleanup();
      }
    });
  }

  @SiteRoute("POST", "/api/design-ai/packs", { auth: "user" })
  async designAiPacks(@CurrentUser() user: AuthUser, @RawBody() raw: Buffer): Promise<Response> {
    const { packId } = aiPackSchema.parse(parseJsonBody(raw));
    if (!(await this.limiter.hit(`design-ai-pack:${user.id}`, 10, 10 * 60_000))) throw new ApiError(429, "kaspiRate");
    await this.ports.ensureCatalog();
    const pack = getAiPack(packId);
    if (!pack || pack.hidden) throw new ApiError(404, "notFound");
    const purchase = await this.ports.createDesignAiPurchase(user.id, pack);
    return Response.json({
      purchase: { id: purchase.id, number: purchase.number, requests: purchase.requests, amount: purchase.amount },
      kaspi: await this.ports.kaspiPaymentProps({ kind: "ai_pack", id: purchase.id }, user.phone ?? ""),
    });
  }

  @SiteRoute("GET", "/api/media/oembed", { auth: "user" })
  async mediaOembed(@Req() req: FastifyRequest): Promise<Response> {
    const id = youtubeId(new URL(req.url, "http://localhost").searchParams.get("url") ?? "");
    if (!id) return Response.json({ title: null });
    const res = await this.ports.fetchYoutubeTitle(id);
    if (!res.ok) return Response.json({ title: null });
    return Response.json({ title: res.title || null }, { headers: { "Cache-Control": "private, max-age=3600" } });
  }

  @SiteRoute("GET", "/api/fonts/{file}", { auth: "none" })
  async fontFile(@Param("file") file: string): Promise<Response> {
    if (!fontFiles.has(file)) return new Response(null, { status: 404 });
    const data = await this.ports.readFontFile(file);
    if (!data) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "font/ttf",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  @SiteRoute("GET", "/api/photos/{id}", { auth: "user" })
  photoStream(
    @Param("id") rawId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Response> {
    return measureFile("photo", async () => {
      const id = requireUuid(rawId);
      const bookId = await this.authoring.queries.photoBookId(id);
      const viewer = await this.access.viewerFor(req, user, bookId);
      const photo = await this.authoring.queries.photoFor(id, viewer);
      if (!photo) throw new ApiError(404, "notFound");
      const param = new URL(req.url, "http://localhost").searchParams.get("size");
      const size = param === "full" || param === "view" || param === "original" ? param : "thumb";
      const key = size === "thumb" ? photo.thumbKey : size === "original" ? await this.authoring.photos.originalKey(photo) : photo.storageKey;
      const etag = `"${createHash("sha1").update(`${size}:${key}`).digest("hex").slice(0, 16)}"`;
      const headers = {
        "Content-Type": "image/jpeg",
        "Cache-Control": size === "view" ? "private, max-age=60, must-revalidate" : "private, no-cache",
        ETag: etag,
      };
      if (header(req, "if-none-match") === etag) return new Response(null, { status: 304, headers });
      if (size === "view") return new Response(new Uint8Array(await this.authoring.photoViewFile(key)), { headers });
      const { signal, cleanup } = createRequestAbort(req, reply);
      try {
        const res = await this.ports.servePhotoFile(
          key,
          { range: header(req, "range"), ifNoneMatch: header(req, "if-none-match"), signal },
          headers,
        );
        if (!res) throw new ApiError(404, "notFound");
        return res;
      } finally {
        cleanup();
      }
    });
  }

  @SiteRoute("GET", "/api/covers/{file}", { auth: "none" })
  coverArt(@Param("file") file: string, @Req() req: FastifyRequest): Promise<Response> {
    return measureFile("cover-art", async () => {
      const entry = await this.ports.coverArt(file);
      if (!entry) return new Response(null, { status: 404 });
      const accept = header(req, "accept-encoding") ?? "";
      const [body, encoding] =
        entry.br && /\bbr\b/.test(accept)
          ? [entry.br, "br"]
          : entry.gzip && /\bgzip\b/.test(accept)
            ? [entry.gzip, "gzip"]
            : [entry.raw, null];
      return new Response(typeof body === "string" ? body : new Uint8Array(body), {
        headers: {
          "Content-Type": entry.type,
          "Cache-Control": "public, max-age=31536000, immutable",
          Vary: "Accept-Encoding",
          ...(encoding ? { "Content-Encoding": encoding } : {}),
        },
      });
    });
  }

  @SiteRoute("GET", "/api/cover-photos/{key}", { auth: "none" })
  coverPhoto(@Param("key") rawKey: string, @Req() req: FastifyRequest): Promise<Response> {
    return measureFile("cover-photo", async () => {
      let key: string;
      try {
        key = decodeURIComponent(rawKey);
      } catch {
        return new Response(null, { status: 404 });
      }
      if (!isCoverPhotoKey(key)) return new Response(null, { status: 404 });
      const asked = Number(new URL(req.url, "http://localhost").searchParams.get("w")) || 1600;
      const width = COVER_PHOTO_WIDTHS.find((w) => w >= asked) ?? COVER_PHOTO_WIDTHS[COVER_PHOTO_WIDTHS.length - 1];
      let body: Buffer;
      try {
        body = await this.ports.coverPhotoResized(key, width);
      } catch {
        return new Response(null, { status: 404 });
      }
      return new Response(new Uint8Array(body), {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    });
  }
}
