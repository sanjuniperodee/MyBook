import { Controller, Inject, Logger } from "@nestjs/common";
import type { Output, Parsed } from "@mybook/contracts";
import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { isEmptyEdit, MAX_EDIT_BYTES, parsePhotoEdit } from "@/lib/photo-edit/doc";
import type { BookRow, BookViewer } from "@/modules/authoring";
import { formatPhotoUploadResult, toPhoto } from "@/modules/authoring/ui/booksView";
import { buildPhotoEditorStateView, resolvePhotoEditorSlot, toPhotoEditorResult } from "@/modules/authoring/ui/photoEditorView";
import type { CurrentUser as AuthUser } from "@/modules/identity";
import type { RateLimiter } from "@/shared/application/RateLimiter";
import { CurrentUser } from "../../core/auth/current-user.decorator";
import { ApiError } from "../../core/errors/api-error";
import { Input, RequestLocale } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { RATE_LIMITER } from "../../core/kernel/tokens";
import {
  AUTHORING,
  AUTHORING_ASSISTANT,
  AUTHORING_PHOTO_LIMIT,
  AUTHORING_PHOTO_RENDERER,
  type AuthoringAssistantPort,
  type AuthoringFacade,
  type PhotoEditRendererPort,
  type PhotoLimitPort,
} from "./authoring.tokens";
import { AccessibleBook, BookAccess, BookAccessViewer } from "./book-access.guard";
import { WebBookPagesQuery } from "./web-book-pages.query";

/** ~10 минут записи в m4a/aac (до ~1,5 МБ в минуту) с запасом. */
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const log = new Logger("authoring-media");

/**
 * Фото книги, редактор фото и голосовая диктовка ответа.
 * Лимиты на пользователя (`upload:*`, `photo-edit:*`, `dictation:*`, `dictation-day:*`) общие с mybook-api.
 */
@Controller()
export class PhotosController {
  constructor(
    @Inject(AUTHORING) private readonly authoring: AuthoringFacade,
    @Inject(AUTHORING_PHOTO_LIMIT) private readonly photoLimit: PhotoLimitPort,
    @Inject(AUTHORING_PHOTO_RENDERER) private readonly renderer: PhotoEditRendererPort,
    @Inject(AUTHORING_ASSISTANT) private readonly assistant: AuthoringAssistantPort,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    @Inject(WebBookPagesQuery) private readonly webPages: WebBookPagesQuery,
  ) {}

  private async photoEditorResult(bookId: string, photoId: string, edited: boolean): Promise<Output<"photoEditorSave">> {
    const row = (await this.authoring.queries.photos(bookId)).find((p) => p.id === photoId);
    if (!row) throw new ApiError(404, "photoNotFound");
    return toPhotoEditorResult(row, edited);
  }

  @Endpoint("photoUpload")
  @BookAccess("viewer")
  async photoUpload(
    @CurrentUser() user: AuthUser,
    @Input() input: Parsed<"photoUpload">,
    @BookAccessViewer() viewer: BookViewer,
    @RequestLocale() locale: Locale,
  ): Promise<Output<"photoUpload">> {
    if (!(await this.limiter.hit(`upload:${user.id}`, 60, 3_600_000))) throw new ApiError(429, "photosRate");
    const files = input.files.map((f) => ({ name: f.name, size: f.size, bytes: async () => Buffer.from(await f.arrayBuffer()) }));
    const result = await this.authoring.photos.upload(input.bookId, viewer, files, await this.photoLimit.maxPhotos());
    const rows = await this.authoring.queries.photos(input.bookId);
    return formatPhotoUploadResult(rows, result, messagesFor(locale).api);
  }

  @Endpoint("photoUpdate")
  @BookAccess("viewer")
  async photoUpdate(@Input() input: Parsed<"photoUpdate">, @BookAccessViewer() viewer: BookViewer): Promise<Output<"photoUpdate">> {
    await this.authoring.photos.update(input.bookId, viewer, input.photoId, input.body);
    const [rows, book] = await Promise.all([this.authoring.queries.photos(input.bookId), this.authoring.queries.book(input.bookId)]);
    const photo = rows.find((p) => p.id === input.photoId);
    if (!photo) throw new ApiError(404, "notFound");
    return { photo: toPhoto(photo), layoutRev: book?.layoutRev ?? 1 };
  }

  @Endpoint("photoDelete")
  @BookAccess("viewer")
  async photoDelete(@Input() input: Parsed<"photoDelete">, @BookAccessViewer() viewer: BookViewer): Promise<Output<"photoDelete">> {
    await this.authoring.photos.delete(input.bookId, viewer, input.photoId);
    return { ok: true };
  }

  @Endpoint("photoEditorGet")
  @BookAccess("edit")
  async photoEditorGet(
    @CurrentUser() user: AuthUser,
    @AccessibleBook() book: BookRow,
    @BookAccessViewer() viewer: BookViewer,
    @Input() input: Parsed<"photoEditorGet">,
  ): Promise<Output<"photoEditorGet">> {
    const locale = isLocale(user.locale) ? user.locale : defaultLocale;
    const m = messagesFor(locale);
    const state = await this.authoring.photos.editState(input.bookId, viewer, input.photoId);
    const photo = await this.authoring.queries.photoFor(input.photoId, viewer);
    if (!photo || photo.bookId !== input.bookId) throw new ApiError(404, "photoNotFound");

    const originalKey = await this.authoring.photos.originalKey(photo);
    let originalWidth = photo.width;
    let originalHeight = photo.height;
    let suggestedLevels = { black: 0, white: 1, gamma: 1 };
    try {
      const origBytes = await this.authoring.photoFile(originalKey);
      const probed = await this.renderer.probeOriginal(origBytes);
      originalWidth = probed.width;
      originalHeight = probed.height;
      suggestedLevels = probed.suggestedLevels;
    } catch {
      // Если исходный файл недоступен (например, тестовая фикстура), оставляем размеры строки фото.
    }

    let slot: Output<"photoEditorGet">["slot"] = null;
    let slotAspect: { key: string; label: string; ratio: number } | null = null;
    try {
      const tab = await this.webPages.photosTab(book, true, m);
      const resolved = resolvePhotoEditorSlot(book, photo, tab.places, m);
      slot = resolved.slot;
      slotAspect = resolved.slotAspect;
    } catch {
      slot = null;
    }

    return buildPhotoEditorStateView({
      bookId: book.id,
      photo,
      state,
      originalWidth,
      originalHeight,
      suggestedLevels,
      slot,
      slotAspect,
      m,
    });
  }

  @Endpoint("photoEditorSave")
  @BookAccess("viewer")
  async photoEditorSave(
    @CurrentUser() user: AuthUser,
    @Input() input: Parsed<"photoEditorSave">,
    @BookAccessViewer() viewer: BookViewer,
  ): Promise<Output<"photoEditorSave">> {
    if (!(await this.limiter.hit(`photo-edit:${user.id}`, 120, 3_600_000))) throw new ApiError(429, "photosRate");
    const serialized = JSON.stringify(input.body.edit);
    if (serialized.length > MAX_EDIT_BYTES) throw new ApiError(400, "photoEditInvalid");
    const doc = parsePhotoEdit(input.body.edit);
    if (!doc) throw new ApiError(400, "photoEditInvalid");

    const current = await this.authoring.photos.editState(input.bookId, viewer, input.photoId);
    if (current.version !== input.body.version) throw new ApiError(409, "photosOutdated");

    if (isEmptyEdit(doc)) {
      if (current.edit !== null) await this.authoring.photos.revertEdit(input.bookId, viewer, input.photoId);
      return this.photoEditorResult(input.bookId, input.photoId, false);
    }

    const photo = await this.authoring.queries.photoFor(input.photoId, viewer);
    if (!photo || photo.bookId !== input.bookId) throw new ApiError(404, "photoNotFound");
    const originalKey = await this.authoring.photos.originalKey(photo);
    const origBytes = await this.authoring.photoFile(originalKey);
    const rendered = await this.renderer.renderEdit(origBytes, doc);
    await this.authoring.photos.saveEdit(input.bookId, viewer, input.photoId, {
      bytes: rendered,
      doc,
      version: input.body.version,
    });
    return this.photoEditorResult(input.bookId, input.photoId, true);
  }

  @Endpoint("photoEditorRevert")
  @BookAccess("viewer")
  async photoEditorRevert(@Input() input: Parsed<"photoEditorRevert">, @BookAccessViewer() viewer: BookViewer): Promise<Output<"photoEditorRevert">> {
    await this.authoring.photos.revertEdit(input.bookId, viewer, input.photoId);
    return this.photoEditorResult(input.bookId, input.photoId, false);
  }

  @Endpoint("answerDictate")
  @BookAccess("edit")
  async answerDictate(
    @CurrentUser() user: AuthUser,
    @AccessibleBook() book: BookRow,
    @Input() input: Parsed<"answerDictate">,
  ): Promise<Output<"answerDictate">> {
    const audio = input.files[0];
    if (!audio) throw new ApiError(400, "badRequest");
    if (audio.size > MAX_AUDIO_BYTES) throw new ApiError(413, "dictationTooLong");
    if (!(await this.limiter.hit(`dictation:${user.id}`, 20, 600_000)) || !(await this.limiter.hit(`dictation-day:${user.id}`, 150, 86_400_000))) {
      throw new ApiError(429, "dictationRate");
    }
    const res = await this.assistant.dictate({
      data: Buffer.from(await audio.arrayBuffer()).toString("base64"),
      mime: audio.type || "audio/mp4",
      language: book.language === "kk" ? "kk" : "ru",
    });
    if ("error" in res) {
      log.error(`dictation: ${res.error}`);
      throw new ApiError(502, "dictationFailed");
    }
    return { text: res.text.trim() };
  }
}
