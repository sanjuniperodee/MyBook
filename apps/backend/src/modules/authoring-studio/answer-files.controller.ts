import { randomUUID } from "node:crypto";
import { Controller, Inject, UseGuards } from "@nestjs/common";
import type { Output, Parsed } from "@mybook/contracts";
import { getMediaPack } from "@/config/site";
import type { Locale } from "@/i18n/config";
import { messagesFor, type Messages } from "@/i18n/messages";
import { FILE_CHUNK_BYTES } from "@/lib/book/answer-files";
import { MAX_MEDIA, normalizeMedia, parseMediaUrl } from "@/lib/book/answer-media";
import type { BookRow } from "@/modules/authoring";
import { isBookEditableBy, type BookViewer } from "@/modules/authoring/domain";
import {
  answerFileViewOf,
  buildAnswerFilePackPurchase,
  buildAnswerMediaState,
  fetchYoutubeOembedTitle,
  kaspiInvoiceDto,
  MUSIC_SOURCES,
  resolveAnswerMediaLocale,
  toAnswerFileQuota,
  toAnswerFileState,
} from "@/modules/authoring/ui/answer-media-view";
import type { CurrentUser as AuthUser } from "@/modules/identity";
import type { RateLimiter } from "@/shared/application/RateLimiter";
import type { AnswerMedia } from "@/shared/infrastructure/db/schema";
import { CurrentUser } from "../../core/auth/current-user.decorator";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { ApiError } from "../../core/errors/api-error";
import { Input, RequestLocale } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { RATE_LIMITER } from "../../core/kernel/tokens";
import { BookAccess, BookAccessGuard, type AccessibleBook } from "../identity/book-access.guard";
import { ANSWER_FILES_PORTS, type AnswerFilesPorts } from "./authoring-studio.tokens";

/** Проверка права правки книги (паритет с `apiBook(..., { editable: true })`). */
function assertEditableBook(access: AccessibleBook): void {
  if (!isBookEditableBy(access.book.userId, access.viewer)) throw new ApiError(404, "bookNotFound");
  if (access.book.status !== "draft") throw new ApiError(409, "bookLocked");
}

/**
 * Контекст 2B — QR-медиа, свои видео/аудио к ответам и покупка пакетов минут через Kaspi (11 маршрутов API v1).
 * Лимиты частоты по `user.id` идут через общий `RATE_LIMITER` с теми же ключами, что у сайта.
 */
@Controller()
@UseGuards(BookAccessGuard)
export class AnswerFilesController {
  constructor(
    @Inject(ANSWER_FILES_PORTS) private readonly files: AnswerFilesPorts,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private messagesOf(user: AuthUser, locale: Locale): Messages {
    return messagesFor(resolveAnswerMediaLocale(user.locale, locale));
  }

  private async loadQuestion(bookId: string, questionId: string) {
    const rows = await this.files.questions(bookId);
    const question = rows.find((q) => q.id === questionId);
    if (!question) throw new ApiError(404, "notFound");
    return question;
  }

  private async ownedFile(bookId: string, fileId: string) {
    const file = await this.files.findBookFile(bookId, fileId);
    if (!file) throw new ApiError(404, "fileNotFound");
    return file;
  }

  private async ownedPurchase(bookId: string, purchaseId: string, userId: string) {
    const purchase = await this.files.findMediaPurchase(purchaseId);
    if (!purchase || purchase.bookId !== bookId || purchase.userId !== userId) throw new ApiError(404, "notFound");
    return purchase;
  }

  private async buildMediaState(
    book: BookRow,
    viewer: BookViewer,
    questionId: string,
    m: Messages,
  ): Promise<Output<"answerMediaGet">> {
    const [question, quotaRaw, files, packsRaw] = await Promise.all([
      this.loadQuestion(book.id, questionId),
      this.files.bookFileQuota(book.id),
      this.files.listBookFiles(book.id),
      this.files.mediaPackOffers(),
    ]);
    const kaspiOn = packsRaw.length ? await this.files.kaspiAvailable() : false;
    return buildAnswerMediaState({
      book,
      viewer,
      answer: question.answer ?? "",
      rawMedia: question.media as AnswerMedia[] | null | undefined,
      quota: quotaRaw,
      files: files.map((row) => answerFileViewOf(row, this.config.appUrl)),
      packsRaw,
      kaspiOn,
      messages: m,
    });
  }

  @Endpoint("answerMediaGet")
  async mediaGet(
    @CurrentUser() user: AuthUser,
    @BookAccess() access: AccessibleBook,
    @Input() input: Parsed<"answerMediaGet">,
    @RequestLocale() locale: Locale,
  ): Promise<Output<"answerMediaGet">> {
    return this.buildMediaState(access.book, access.viewer, input.questionId, this.messagesOf(user, locale));
  }

  @Endpoint("answerMediaSave")
  async mediaSave(
    @CurrentUser() user: AuthUser,
    @BookAccess() access: AccessibleBook,
    @Input() input: Parsed<"answerMediaSave">,
    @RequestLocale() locale: Locale,
  ): Promise<Output<"answerMediaSave">> {
    assertEditableBook(access);
    await this.files.editQuestionMedia(access.book.id, access.viewer, input.questionId, input.body.media);
    return this.buildMediaState(access.book, access.viewer, input.questionId, this.messagesOf(user, locale));
  }

  @Endpoint("answerMediaAddLink")
  async mediaAddLink(
    @CurrentUser() user: AuthUser,
    @BookAccess() access: AccessibleBook,
    @Input() input: Parsed<"answerMediaAddLink">,
    @RequestLocale() locale: Locale,
  ): Promise<Output<"answerMediaAddLink"> | Response> {
    assertEditableBook(access);
    const m = this.messagesOf(user, locale);
    const t = m.editor.media;
    const parsed = parseMediaUrl(input.body.url);
    if (!parsed) return Response.json({ error: t.badUrl, code: "badUrl" }, { status: 400 });
    const question = await this.loadQuestion(access.book.id, input.questionId);
    const current = normalizeMedia((question.media as AnswerMedia[] | null | undefined) ?? []);
    if (current.length >= MAX_MEDIA) return Response.json({ error: t.limit(MAX_MEDIA), code: "tooManyMedia" }, { status: 400 });
    if (current.some((x) => x.url === parsed.url)) return Response.json({ error: t.duplicate, code: "duplicate" }, { status: 400 });
    const title = parsed.youtubeId ? ((await fetchYoutubeOembedTitle(parsed.url)) ?? "") : "";
    const next: AnswerMedia[] = [
      ...current,
      { id: randomUUID(), kind: MUSIC_SOURCES.has(parsed.source) ? "music" : "video", url: parsed.url, title, anchor: null },
    ];
    await this.files.editQuestionMedia(access.book.id, access.viewer, input.questionId, next);
    return this.buildMediaState(access.book, access.viewer, input.questionId, m);
  }

  @Endpoint("answerFileStart")
  async fileStart(
    @CurrentUser() user: AuthUser,
    @BookAccess() access: AccessibleBook,
    @Input() input: Parsed<"answerFileStart">,
    @RequestLocale() locale: Locale,
  ): Promise<Output<"answerFileStart">> {
    assertEditableBook(access);
    if (!(await this.limiter.hit(`answer-file:${user.id}`, 30, 3600_000))) throw new ApiError(429, "fileRate");
    const b = input.body;
    const row = await this.files.startUpload({
      bookId: access.book.id,
      userId: user.id,
      name: b.name,
      size: b.size,
      mime: b.type,
      declaredSec: b.durationSec,
    });
    const m = this.messagesOf(user, locale);
    return { file: toAnswerFileState(answerFileViewOf(row, this.config.appUrl), m), chunkBytes: FILE_CHUNK_BYTES };
  }

  @Endpoint("answerFileStatus")
  async fileStatus(
    @CurrentUser() user: AuthUser,
    @BookAccess() access: AccessibleBook,
    @Input() input: Parsed<"answerFileStatus">,
    @RequestLocale() locale: Locale,
  ): Promise<Output<"answerFileStatus">> {
    const file = await this.ownedFile(access.book.id, input.fileId);
    const quota = await this.files.bookFileQuota(access.book.id);
    const m = this.messagesOf(user, locale);
    return { file: toAnswerFileState(answerFileViewOf(file, this.config.appUrl), m), quota: toAnswerFileQuota(quota, m) };
  }

  @Endpoint("answerFileChunk")
  async fileChunk(
    @BookAccess() access: AccessibleBook,
    @Input() input: Parsed<"answerFileChunk">,
  ): Promise<Output<"answerFileChunk">> {
    assertEditableBook(access);
    const file = await this.ownedFile(access.book.id, input.fileId);
    const chunk = input.files[0];
    if (!chunk) throw new ApiError(400, "fileChunk");
    if (chunk.size > FILE_CHUNK_BYTES) throw new ApiError(413, "fileChunk");
    const bytes = Buffer.from(await chunk.arrayBuffer());
    return { received: await this.files.appendChunk(file, input.offset, bytes) };
  }

  @Endpoint("answerFileFinish")
  async fileFinish(
    @CurrentUser() user: AuthUser,
    @BookAccess() access: AccessibleBook,
    @Input() input: Parsed<"answerFileFinish">,
    @RequestLocale() locale: Locale,
  ): Promise<Output<"answerFileFinish">> {
    assertEditableBook(access);
    const file = await this.ownedFile(access.book.id, input.fileId);
    const finished = await this.files.finishUpload(file);
    this.files.kickWorker();
    const quota = await this.files.bookFileQuota(access.book.id);
    const m = this.messagesOf(user, locale);
    return { file: toAnswerFileState(answerFileViewOf(finished, this.config.appUrl), m), quota: toAnswerFileQuota(quota, m) };
  }

  @Endpoint("answerFileDelete")
  async fileDelete(
    @BookAccess() access: AccessibleBook,
    @Input() input: Parsed<"answerFileDelete">,
  ): Promise<Output<"answerFileDelete">> {
    assertEditableBook(access);
    const file = await this.ownedFile(access.book.id, input.fileId);
    await this.files.removeFile(file);
    return { ok: true };
  }

  @Endpoint("answerFilePackBuy")
  async packBuy(
    @CurrentUser() user: AuthUser,
    @BookAccess() access: AccessibleBook,
    @Input() input: Parsed<"answerFilePackBuy">,
    @RequestLocale() locale: Locale,
  ): Promise<Output<"answerFilePackBuy">> {
    assertEditableBook(access);
    if (!(await this.limiter.hit(`media-pack:${user.id}`, 10, 10 * 60_000))) throw new ApiError(429, "kaspiRate");
    await this.files.ensureCatalog();
    const pack = getMediaPack(input.body.packId);
    if (!pack || pack.hidden || pack.price <= 0) throw new ApiError(404, "notFound");
    const purchase = await this.files.createMediaPurchase(user.id, access.book.id, pack);
    const kaspiProps = await this.files.kaspiPaymentProps(purchase.id, user.phone ?? "");
    return buildAnswerFilePackPurchase(purchase, kaspiProps, this.messagesOf(user, locale));
  }

  @Endpoint("answerFilePackKaspi")
  async packKaspi(
    @CurrentUser() user: AuthUser,
    @BookAccess() access: AccessibleBook,
    @Input() input: Parsed<"answerFilePackKaspi">,
  ): Promise<Output<"answerFilePackKaspi">> {
    assertEditableBook(access);
    await this.ownedPurchase(access.book.id, input.purchaseId, user.id);
    if (!(await this.limiter.hit(`kaspi-invoice-user:${user.id}`, 10, 10 * 60_000))) throw new ApiError(429, "kaspiRate");
    const invoice = await this.files.payMediaPack(input.purchaseId, user.id, {
      method: input.body.method,
      phone: input.body.phone,
    });
    return { invoice: kaspiInvoiceDto(invoice) };
  }

  @Endpoint("answerFilePackKaspiStatus")
  async packKaspiStatus(
    @CurrentUser() user: AuthUser,
    @BookAccess() access: AccessibleBook,
    @Input() input: Parsed<"answerFilePackKaspiStatus">,
    @RequestLocale() locale: Locale,
  ): Promise<Output<"answerFilePackKaspiStatus">> {
    await this.ownedPurchase(access.book.id, input.purchaseId, user.id);
    // Сначала сверяем счёт с Kaspi (он может подтвердить оплату и начислить минуты), потом читаем свежую квоту.
    const invoice = await this.files.kaspiStatus(input.invoiceId, user.id);
    const quota = await this.files.bookFileQuota(access.book.id);
    const m = this.messagesOf(user, locale);
    return { invoice: kaspiInvoiceDto(invoice), quota: toAnswerFileQuota(quota, m) };
  }
}
