import { Controller, Inject, Param, Req, Res } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { isBuildFingerprint, isPageImageWidth } from "@/lib/book/book-build";
import { COVER_IMAGE_WIDTHS, coverVersion, type CoverImageOptions, type CoverImageWidth } from "@/lib/book/cover-image-version";
import { isKnownCover } from "@/lib/book/covers";
import { isInteriorId } from "@/lib/book/interiors";
import type { CurrentUser as AuthUser } from "@/modules/identity";
import { PAGES_IMAGE_WIDTHS, PAGES_SPREADS, RasterizerMissingError, type PagesImageWidth, type PagesSpread } from "@/modules/production";
import { CurrentUser } from "../../core/auth/current-user.decorator";
import { ApiError } from "../../core/errors/api-error";
import { header } from "../../core/http/request";
import { SiteRoute } from "../../core/http/site-route";
import { AUTHORING_PREVIEWS, type AuthoringPreviewsPort } from "../authoring/authoring.tokens";
import { createRequestAbort, measureFile, requireUuid, SiteBookAccessService, uuidSchema } from "./authoring-site.helpers";
import { AUTHORING_SITE_PORTS, type AuthoringSitePorts } from "./authoring-site.tokens";

function isPagesSpread(value: string | null): value is PagesSpread {
  return value !== null && (PAGES_SPREADS as readonly string[]).includes(value);
}

function toPagesImageWidth(value: number): PagesImageWidth {
  for (const w of PAGES_IMAGE_WIDTHS) if (w === value) return w;
  return 1200;
}

function toCoverImageWidth(value: number): CoverImageWidth {
  for (const w of COVER_IMAGE_WIDTHS) if (w === value) return w;
  return 480;
}

/**
 * 8 маршрутов сайта (8 HTTP-обработчиков) для экспорта, предпросмотра, сборки и картинок книги:
 * экспорт TXT, PDF-предпросмотр, растр полос `/pages/{fp}/{n}`, разворот `/pages-image`,
 * картинка обложки `/cover-image`, миниатюра шаблона `/cover-thumb/{template}`, сборка `/build` и ход `/build-progress`.
 */
@Controller()
export class BooksBuildSiteController {
  constructor(
    @Inject(AUTHORING_PREVIEWS) private readonly previews: AuthoringPreviewsPort,
    @Inject(AUTHORING_SITE_PORTS) private readonly ports: AuthoringSitePorts,
    @Inject(SiteBookAccessService) private readonly access: SiteBookAccessService,
  ) {}

  @SiteRoute("GET", "/api/books/{id}/export", { auth: "user" })
  async exportManuscript(@Param("id") rawId: string, @CurrentUser() user: AuthUser, @Req() req: FastifyRequest): Promise<Response> {
    const id = requireUuid(rawId);
    await this.access.bookFor(req, user, id, false);
    const doc = await this.ports.manuscript(id);
    if (!doc) throw new ApiError(404, "bookNotFound");
    const filename = encodeURIComponent(`${doc.title}.txt`);
    return new Response("\uFEFF" + doc.text, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="book.txt"; filename*=UTF-8''${filename}`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  @SiteRoute("GET", "/api/books/{id}/preview", { auth: "user" })
  previewPdf(@Param("id") rawId: string, @CurrentUser() user: AuthUser, @Req() req: FastifyRequest): Promise<Response> {
    return measureFile("book-preview", async () => {
      const id = requireUuid(rawId);
      const { book } = await this.access.bookFor(req, user, id, false);
      const pdf = await this.ports.previewPdf(id);
      if (!pdf) throw new ApiError(404, "bookNotFound");
      const filename = encodeURIComponent(`${book.title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "preview"}.pdf`);
      return new Response(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="preview.pdf"; filename*=UTF-8''${filename}`,
          "Cache-Control": "private, no-store",
        },
      });
    });
  }

  @SiteRoute("GET", "/api/books/{id}/pages/{fp}/{n}", { auth: "user" })
  pageRaster(
    @Param("id") rawId: string,
    @Param("fp") fp: string,
    @Param("n") n: string,
    @CurrentUser() user: AuthUser,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Response> {
    return measureFile("page-raster", async () => {
      const id = requireUuid(rawId);
      const page = /^[1-9]\d{0,3}$/.test(n) ? Number(n) : 0;
      const width = Number(new URL(req.url, "http://localhost").searchParams.get("w"));
      if (!isBuildFingerprint(fp) || !page || !isPageImageWidth(width)) throw new ApiError(400, "badRequest");
      await this.access.bookFor(req, user, id, false);
      const { signal, cleanup } = createRequestAbort(req, reply);
      let image: Awaited<ReturnType<AuthoringSitePorts["pageImage"]>> | "rasterizer" | "gone";
      try {
        image = await this.ports.pageImage(id, fp, page, width, signal).catch((err: unknown) => {
          if (RasterizerMissingError.is(err)) return "rasterizer" as const;
          if (signal.aborted) return "gone" as const;
          throw err;
        });
      } finally {
        cleanup();
      }
      if (image === "gone") return new Response(null, { status: 499 });
      if (image === "rasterizer") return Response.json({ error: "rasterizer" }, { status: 503 });
      if (!image) throw new ApiError(404, "notFound");
      const etag = `"${createHash("sha1").update(image.data).digest("base64url").slice(0, 22)}"`;
      const headers = {
        "Content-Type": "image/webp",
        ETag: etag,
        "Cache-Control": image.limited ? "private, no-cache" : "private, max-age=31536000, immutable",
      };
      if (header(req, "if-none-match")?.split(/\s*,\s*/).includes(etag)) return new Response(null, { status: 304, headers });
      return new Response(new Uint8Array(image.data), { headers });
    });
  }

  @SiteRoute("GET", "/api/books/{id}/pages-image", { auth: "user" })
  async pagesImage(@Param("id") id: string, @CurrentUser() user: AuthUser, @Req() req: FastifyRequest): Promise<Response> {
    if (!uuidSchema.safeParse(id).success) throw new ApiError(404, "bookNotFound");
    const { book } = await this.access.bookFor(req, user, id, false);
    const q = new URL(req.url, "http://localhost").searchParams;
    const kind = q.get("kind");
    const w = Number(q.get("w"));
    const design = q.get("design") ?? undefined;
    const preview = q.get("preview") ?? undefined;
    if (
      !isPagesSpread(kind) ||
      (design !== undefined && !isInteriorId(design)) ||
      (preview !== undefined && !/^[0-9a-f]{16}$/.test(preview))
    ) {
      throw new ApiError(400, "badRequest");
    }
    const width = toPagesImageWidth(w);
    const res = await this.ports.pagesSpreadImage(book.id, kind, width, design, preview);
    if (!res) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(res.image), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=31536000, immutable",
        ETag: `"${res.version}-${kind}-${width}"`,
      },
    });
  }

  @SiteRoute("GET", "/api/books/{id}/cover-image", { auth: "user" })
  async coverImage(@Param("id") id: string, @CurrentUser() user: AuthUser, @Req() req: FastifyRequest): Promise<Response> {
    if (!uuidSchema.safeParse(id).success) throw new ApiError(404, "bookNotFound");
    const { book } = await this.access.bookFor(req, user, id, false);
    const q = new URL(req.url, "http://localhost").searchParams;
    const width = toCoverImageWidth(Number(q.get("w")));
    const template = q.get("template") ?? undefined;
    if (template !== undefined && !isKnownCover(template)) throw new ApiError(400, "badRequest");
    const side = q.get("side");
    const pages = Math.round(Number(q.get("p")));
    if (side === "spread" && !(pages >= 1 && pages <= 2000)) throw new ApiError(400, "badRequest");
    const options: CoverImageOptions = side === "spread" ? { side: "spread", pages } : side === "back" ? { side: "back" } : template ? { template } : {};
    const img = await this.ports.coverImage(book, width, options);
    if (!img) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(img), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=31536000, immutable",
        ETag: `"${coverVersion(book, options)}-${width}"`,
      },
    });
  }

  @SiteRoute("GET", "/api/books/{id}/cover-thumb/{template}", { auth: "user" })
  async coverThumb(
    @Param("id") id: string,
    @Param("template") template: string,
    @CurrentUser() user: AuthUser,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    if (!uuidSchema.safeParse(id).success) throw new ApiError(404, "bookNotFound");
    const { book } = await this.access.bookFor(req, user, id, false);
    const img = await this.ports.coverTemplateThumb(book, template);
    if (!img) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(img), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  }

  @SiteRoute("GET", "/api/books/{id}/build", { auth: "user" })
  async buildState(@Param("id") rawId: string, @CurrentUser() user: AuthUser, @Req() req: FastifyRequest): Promise<Response> {
    const id = requireUuid(rawId);
    await this.access.bookFor(req, user, id, false);
    const retry = new URL(req.url, "http://localhost").searchParams.get("retry") === "1";
    const state = await this.previews.build(id, { retry });
    if (!state) throw new ApiError(404, "bookNotFound");
    return Response.json(state, { headers: { "Cache-Control": "private, no-store" } });
  }

  @SiteRoute("GET", "/api/books/{id}/build-progress", { auth: "user" })
  async buildProgress(@Param("id") rawId: string, @CurrentUser() user: AuthUser, @Req() req: FastifyRequest): Promise<Response> {
    const id = requireUuid(rawId);
    await this.access.bookFor(req, user, id, false);
    return Response.json({ progress: this.previews.progressOf(id) }, { headers: { "Cache-Control": "private, no-store" } });
  }
}
