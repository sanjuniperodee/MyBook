import { Controller, Inject, Param, Req } from "@nestjs/common";
import { PhotoPatch } from "@mybook/contracts";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { getMediaPack } from "@/config/site";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { FILE_CHUNK_BYTES, MAX_SOURCE_BYTES } from "@/lib/book/answer-files";
import { MAX_EDIT_BYTES, parsePhotoEdit } from "@/lib/photo-edit/doc";
import { MAX_PHOTOS_CEILING } from "@/modules/authoring/domain/Photo";
import type { CurrentUser as AuthUser } from "@/modules/identity";
import type { RateLimiter } from "@/shared/application/RateLimiter";
import { CurrentUser } from "../../core/auth/current-user.decorator";
import { ApiError } from "../../core/errors/api-error";
import { RequestLocale } from "../../core/http/decorators";
import { header } from "../../core/http/request";
import { RawBody, SiteRoute } from "../../core/http/site-route";
import { RATE_LIMITER } from "../../core/kernel/tokens";
import { AUTHORING, AUTHORING_PHOTO_LIMIT, type AuthoringFacade, type PhotoLimitPort } from "../authoring/authoring.tokens";
import { parseJsonBody, readBinaryBody, requireUuid, SiteBookAccessService, uuidSchema } from "./authoring-site.helpers";
import { AUTHORING_SITE_PORTS, type AuthoringSitePorts, type SiteAnswerFileRow } from "./authoring-site.tokens";

const photosOrderSchema = z.object({ ids: z.array(uuidSchema).max(500) });
const photosBatchSchema = z
  .object({ updates: z.array(z.object({ id: uuidSchema, patch: PhotoPatch }).strict()).min(1).max(MAX_PHOTOS_CEILING) })
  .strict();

const fileStartSchema = z.object({
  name: z.string().trim().min(1).max(300),
  size: z.number().int().min(1).max(MAX_SOURCE_BYTES * 2),
  type: z.string().max(200).default(""),
  durationSec: z.number().min(0).max(24 * 3600).nullable().default(null),
});

const mediaPackSchema = z.object({ packId: z.string().max(20) });

async function readUploadPhotos(req: FastifyRequest): Promise<Array<{ name: string; size: number; bytes: () => Promise<Buffer> }>> {
  if (!req.isMultipart()) throw new TypeError("Unsupported form content-type");
  const files: Array<{ name: string; size: number; bytes: () => Promise<Buffer> }> = [];
  for await (const part of req.parts()) {
    if (part.type === "file") {
      if (part.fieldname === "files") {
        const buf = await part.toBuffer();
        if (buf.length > 0) {
          const name = part.filename || "photo";
          files.push({ name, size: buf.length, bytes: async () => buf });
        }
      } else {
        part.file.resume();
      }
    }
  }
  return files;
}

async function readPhotoEditForm(req: FastifyRequest): Promise<{ image: Buffer | null; edit: string | null; version: string | null }> {
  if (!req.isMultipart()) throw new TypeError("Unsupported form content-type");
  let image: Buffer | null = null;
  let edit: string | null = null;
  let version: string | null = null;
  for await (const part of req.parts()) {
    if (part.type === "file") {
      if (part.fieldname === "image" && image === null) {
        image = await part.toBuffer();
      } else {
        part.file.resume();
      }
    } else if (part.fieldname === "edit" && edit === null) {
      edit = typeof part.value === "string" ? part.value : String(part.value ?? "");
    } else if (part.fieldname === "version" && version === null) {
      version = typeof part.value === "string" ? part.value : String(part.value ?? "");
    }
  }
  return { image, edit, version };
}

/**
 * 10 маршрутов сайта (17 HTTP-обработчиков) для фото книги, раскладки и своих видео/аудио (QR-файлов).
 * Статические подмаршруты (`/order`, `/batch`, `/packs`) объявлены раньше параметрических (`{pid}`, `{fileId}`).
 */
@Controller()
export class BooksMediaSiteController {
  constructor(
    @Inject(AUTHORING) private readonly authoring: AuthoringFacade,
    @Inject(AUTHORING_PHOTO_LIMIT) private readonly photoLimit: PhotoLimitPort,
    @Inject(AUTHORING_SITE_PORTS) private readonly ports: AuthoringSitePorts,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    @Inject(SiteBookAccessService) private readonly access: SiteBookAccessService,
  ) {}

  private async photoRow(bookId: string, photoId: string) {
    return (await this.authoring.queries.photos(bookId)).find((p) => p.id === photoId);
  }

  private async loadAnswerFile(req: FastifyRequest, user: AuthUser, rawId: string, rawFileId: string, editable: boolean): Promise<SiteAnswerFileRow> {
    const id = requireUuid(rawId);
    const fileId = requireUuid(rawFileId);
    const { book } = await this.access.bookFor(req, user, id, editable);
    const file = await this.ports.findBookFile(book.id, fileId);
    if (!file) throw new ApiError(404, "fileNotFound");
    return file;
  }

  // ─── Фото и раскладка ───────────────────────────────────────────────────

  @SiteRoute("PUT", "/api/books/{id}/photos/order", { auth: "user" })
  async photosOrder(
    @Param("id") rawId: string,
    @CurrentUser() user: AuthUser,
    @RawBody() raw: Buffer,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const viewer = await this.access.viewerFor(req, user, id);
    const { ids } = photosOrderSchema.parse(parseJsonBody(raw));
    await this.authoring.photos.reorder(id, viewer, ids);
    return Response.json({ ok: true });
  }

  @SiteRoute("POST", "/api/books/{id}/photos/batch", { auth: "user" })
  async photosBatch(
    @Param("id") rawId: string,
    @CurrentUser() user: AuthUser,
    @RawBody() raw: Buffer,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const viewer = await this.access.viewerFor(req, user, id);
    const { updates } = photosBatchSchema.parse(parseJsonBody(raw));
    await this.authoring.photos.batch(id, viewer, updates);
    const ids = new Set(updates.map((u) => u.id));
    const [rows, book] = await Promise.all([this.authoring.queries.photos(id), this.authoring.queries.book(id)]);
    return Response.json({ photos: rows.filter((p) => ids.has(p.id)), layoutRev: book?.layoutRev });
  }

  @SiteRoute("GET", "/api/books/{id}/photos/{pid}/edit", { auth: "user" })
  async photoEditGet(
    @Param("id") rawId: string,
    @Param("pid") rawPid: string,
    @CurrentUser() user: AuthUser,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const pid = requireUuid(rawPid);
    const viewer = await this.access.viewerFor(req, user, id);
    return Response.json(await this.authoring.photos.editState(id, viewer, pid));
  }

  @SiteRoute("POST", "/api/books/{id}/photos/{pid}/edit", { auth: "user" })
  async photoEditSave(
    @Param("id") rawId: string,
    @Param("pid") rawPid: string,
    @CurrentUser() user: AuthUser,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const pid = requireUuid(rawPid);
    const viewer = await this.access.viewerFor(req, user, id);
    if (!(await this.limiter.hit(`photo-edit:${user.id}`, 120, 3_600_000))) throw new ApiError(429, "photosRate");
    const { image, edit, version } = await readPhotoEditForm(req);
    if (image === null || edit === null || version === null || edit.length > MAX_EDIT_BYTES) {
      throw new ApiError(400, "photoEditInvalid");
    }
    let doc: ReturnType<typeof parsePhotoEdit> = null;
    try {
      doc = parsePhotoEdit(JSON.parse(edit));
    } catch {
      doc = null;
    }
    if (!doc) throw new ApiError(400, "photoEditInvalid");
    await this.authoring.photos.saveEdit(id, viewer, pid, { bytes: image, doc, version });
    return Response.json({ photo: await this.photoRow(id, pid), edited: true });
  }

  @SiteRoute("DELETE", "/api/books/{id}/photos/{pid}/edit", { auth: "user" })
  async photoEditRevert(
    @Param("id") rawId: string,
    @Param("pid") rawPid: string,
    @CurrentUser() user: AuthUser,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const pid = requireUuid(rawPid);
    const viewer = await this.access.viewerFor(req, user, id);
    await this.authoring.photos.revertEdit(id, viewer, pid);
    return Response.json({ photo: await this.photoRow(id, pid), edited: false });
  }

  @SiteRoute("POST", "/api/books/{id}/photos/{pid}/rotate", { auth: "user" })
  async photoRotate(
    @Param("id") rawId: string,
    @Param("pid") rawPid: string,
    @CurrentUser() user: AuthUser,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const pid = requireUuid(rawPid);
    const viewer = await this.access.viewerFor(req, user, id);
    await this.authoring.photos.rotate(id, viewer, pid);
    return Response.json({ photo: await this.photoRow(id, pid) });
  }

  @SiteRoute("PATCH", "/api/books/{id}/photos/{pid}", { auth: "user" })
  async photoUpdate(
    @Param("id") rawId: string,
    @Param("pid") rawPid: string,
    @CurrentUser() user: AuthUser,
    @RawBody() raw: Buffer,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const pid = requireUuid(rawPid);
    const viewer = await this.access.viewerFor(req, user, id);
    await this.authoring.photos.update(id, viewer, pid, PhotoPatch.parse(parseJsonBody(raw)));
    const [rows, book] = await Promise.all([this.authoring.queries.photos(id), this.authoring.queries.book(id)]);
    return Response.json({ photo: rows.find((p) => p.id === pid), layoutRev: book?.layoutRev });
  }

  @SiteRoute("DELETE", "/api/books/{id}/photos/{pid}", { auth: "user" })
  async photoDelete(
    @Param("id") rawId: string,
    @Param("pid") rawPid: string,
    @CurrentUser() user: AuthUser,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const pid = requireUuid(rawPid);
    const viewer = await this.access.viewerFor(req, user, id);
    await this.authoring.photos.delete(id, viewer, pid);
    return Response.json({ ok: true });
  }

  @SiteRoute("POST", "/api/books/{id}/photos", { auth: "user" })
  async photoUpload(
    @Param("id") rawId: string,
    @CurrentUser() user: AuthUser,
    @RequestLocale() locale: Locale,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const viewer = await this.access.viewerFor(req, user, id);
    if (!(await this.limiter.hit(`upload:${user.id}`, 60, 3_600_000))) throw new ApiError(429, "photosRate");
    const files = await readUploadPhotos(req);
    const result = await this.authoring.photos.upload(id, viewer, files, await this.photoLimit.maxPhotos());
    const t = messagesFor(locale).api;
    const rows = await this.authoring.queries.photos(id);
    const createdIds = new Set(result.created.map((p) => p.id));
    return Response.json({
      photos: rows.filter((p) => createdIds.has(p.id)),
      errors: [
        ...result.failed.map((f) => (f.reason === "tooBig" ? t.photoTooBig(f.name) : t.photoFormat(f.name))),
        ...result.damaged.map((name) => t.photoDamaged(name)),
      ],
    });
  }

  @SiteRoute("POST", "/api/books/{id}/layout", { auth: "user" })
  async bookLayout(@Param("id") rawId: string, @CurrentUser() user: AuthUser, @Req() req: FastifyRequest): Promise<Response> {
    const id = requireUuid(rawId);
    const viewer = await this.access.viewerFor(req, user, id);
    const layoutRev = await this.authoring.photos.upgradeLayout(id, viewer);
    return Response.json({ layoutRev, photos: await this.authoring.queries.photos(id) });
  }

  // ─── Свои видео и аудио (QR-файлы книги) ────────────────────────────────

  @SiteRoute("POST", "/api/books/{id}/files/packs", { auth: "user" })
  async filesPacks(
    @Param("id") rawId: string,
    @CurrentUser() user: AuthUser,
    @RawBody() raw: Buffer,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const { book } = await this.access.bookFor(req, user, id, true);
    const { packId } = mediaPackSchema.parse(parseJsonBody(raw));
    if (!(await this.limiter.hit(`media-pack:${user.id}`, 10, 10 * 60_000))) throw new ApiError(429, "kaspiRate");
    await this.ports.ensureCatalog();
    const pack = getMediaPack(packId);
    if (!pack || pack.hidden || pack.price <= 0) throw new ApiError(404, "notFound");
    const purchase = await this.ports.createMediaPurchase(user.id, book.id, pack);
    return Response.json({
      purchase: { id: purchase.id, number: purchase.number, minutes: purchase.minutes, amount: purchase.amount },
      kaspi: await this.ports.kaspiPaymentProps({ kind: "media_pack", id: purchase.id }, user.phone ?? ""),
    });
  }

  @SiteRoute("GET", "/api/books/{id}/files/{fileId}", { auth: "user" })
  async fileGet(
    @Param("id") rawId: string,
    @Param("fileId") rawFileId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const file = await this.loadAnswerFile(req, user, rawId, rawFileId, false);
    return Response.json({ file: this.ports.fileView(file) });
  }

  @SiteRoute("PUT", "/api/books/{id}/files/{fileId}", { auth: "user" })
  async fileAppendChunk(
    @Param("id") rawId: string,
    @Param("fileId") rawFileId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const file = await this.loadAnswerFile(req, user, rawId, rawFileId, true);
    const offset = Number(new URL(req.url, "http://localhost").searchParams.get("offset"));
    const declared = Number(header(req, "content-length") ?? 0);
    if (declared > FILE_CHUNK_BYTES) throw new ApiError(413, "fileChunk");
    const bytes = await readBinaryBody(req, FILE_CHUNK_BYTES);
    return Response.json({ received: await this.ports.appendChunk(file, offset, bytes) });
  }

  @SiteRoute("POST", "/api/books/{id}/files/{fileId}", { auth: "user" })
  async fileFinish(
    @Param("id") rawId: string,
    @Param("fileId") rawFileId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const file = await this.ports.finishUpload(await this.loadAnswerFile(req, user, rawId, rawFileId, true));
    this.ports.kickAnswerFiles();
    return Response.json({ file: this.ports.fileView(file) });
  }

  @SiteRoute("DELETE", "/api/books/{id}/files/{fileId}", { auth: "user" })
  async fileDelete(
    @Param("id") rawId: string,
    @Param("fileId") rawFileId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    await this.ports.removeFile(await this.loadAnswerFile(req, user, rawId, rawFileId, true));
    return Response.json({ ok: true });
  }

  @SiteRoute("GET", "/api/books/{id}/files", { auth: "user" })
  async filesList(@Param("id") rawId: string, @CurrentUser() user: AuthUser, @Req() req: FastifyRequest): Promise<Response> {
    const id = requireUuid(rawId);
    const { book } = await this.access.bookFor(req, user, id, false);
    const [quota, files, packs] = await Promise.all([
      this.ports.bookFileQuota(book.id),
      this.ports.listBookFiles(book.id),
      this.ports.mediaPackOffers(),
    ]);
    const kaspi = packs.length ? await this.ports.kaspiAvailable() : false;
    return Response.json({ quota, files: files.map((f) => this.ports.fileView(f)), packs: kaspi ? packs : [] });
  }

  @SiteRoute("POST", "/api/books/{id}/files", { auth: "user" })
  async fileStart(
    @Param("id") rawId: string,
    @CurrentUser() user: AuthUser,
    @RawBody() raw: Buffer,
    @Req() req: FastifyRequest,
  ): Promise<Response> {
    const id = requireUuid(rawId);
    const { book } = await this.access.bookFor(req, user, id, true);
    if (!(await this.limiter.hit(`answer-file:${user.id}`, 30, 3_600_000))) throw new ApiError(429, "fileRate");
    const input = fileStartSchema.parse(parseJsonBody(raw));
    const file = await this.ports.startUpload({
      bookId: book.id,
      userId: user.id,
      name: input.name,
      size: input.size,
      mime: input.type,
      declaredSec: input.durationSec,
    });
    return Response.json({ file: this.ports.fileView(file), chunkBytes: FILE_CHUNK_BYTES });
  }
}
