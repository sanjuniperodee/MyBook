/**
 * Свои видео, аудио и ссылки по QR к ответам книги в API v1:
 * тонкий адаптер над модулем authoring (answerFiles / answerFilesWorker), ordering.kaspi и словарями сайта.
 * Чистая сборка представлений, подписей, квоты и QR-кодов — в `@/modules/authoring/ui/answer-media-view`.
 */
import { randomUUID } from "node:crypto";
import { getMediaPack } from "@/config/site";
import { messagesFor, type Messages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import { FILE_CHUNK_BYTES } from "@/lib/book/answer-files";
import { MAX_MEDIA, normalizeMedia, parseMediaUrl } from "@/lib/book/answer-media";
import { type BookRow, type BookViewer } from "@/modules/authoring";
import {
  buildAnswerFilePackPurchase,
  buildAnswerMediaState,
  fetchYoutubeOembedTitle,
  kaspiInvoiceDto,
  MUSIC_SOURCES,
  resolveAnswerMediaLocale,
  toAnswerFileQuota,
  toAnswerFileState,
} from "@/modules/authoring/ui/answer-media-view";
import { apiBook, HttpError } from "@/server/api";
import {
  appendChunk,
  bookFileQuota,
  createMediaPurchase,
  fileView,
  findBookFile,
  findMediaPurchase,
  finishUpload,
  listBookFiles,
  mediaPackOffers,
  removeFile,
  startUpload,
} from "@/server/answerFiles";
import { kickAnswerFiles } from "@/server/answerFilesWorker";
import { ensureCatalog } from "@/server/catalog";
import { container } from "@/server/container";
import { invoiceView, kaspiPaymentProps } from "@/server/kaspi-view";
import { rateLimit } from "@/server/rateLimit";
import type { AnswerMedia, User } from "@/shared/infrastructure/db/schema";
import type { Handlers } from "../app";

async function resolveLocale(user: User | null) {
  return resolveAnswerMediaLocale(user?.locale, await getLocale());
}

async function loadQuestion(bookId: string, questionId: string) {
  const rows = await container().authoring.queries.questions(bookId);
  const question = rows.find((q) => q.id === questionId);
  if (!question) throw new HttpError(404, "notFound");
  return question;
}

async function buildMediaState(book: BookRow, viewer: BookViewer, questionId: string, m: Messages) {
  const [question, quotaRaw, files, packsRaw] = await Promise.all([
    loadQuestion(book.id, questionId),
    bookFileQuota(book.id),
    listBookFiles(book.id),
    mediaPackOffers(),
  ]);
  const kaspiOn = packsRaw.length ? await container().ordering.kaspi.available() : false;
  return buildAnswerMediaState({
    book,
    viewer,
    answer: question.answer ?? "",
    rawMedia: question.media as AnswerMedia[] | null | undefined,
    quota: quotaRaw,
    files: files.map(fileView),
    packsRaw,
    kaspiOn,
    messages: m,
  });
}

async function ownedFile(req: Request, bookId: string, fileId: string, editable: boolean) {
  const { user, book } = await apiBook(req, bookId, { editable });
  const file = await findBookFile(book.id, fileId);
  if (!file) throw new HttpError(404, "fileNotFound");
  return { user, book, file };
}

async function ownedPurchase(bookId: string, purchaseId: string, userId: string) {
  const purchase = await findMediaPurchase(purchaseId);
  if (!purchase || purchase.bookId !== bookId || purchase.userId !== userId) throw new HttpError(404, "notFound");
  return purchase;
}

export const answerFileHandlers: Pick<
  Handlers,
  | "answerMediaGet"
  | "answerMediaSave"
  | "answerMediaAddLink"
  | "answerFileStart"
  | "answerFileStatus"
  | "answerFileChunk"
  | "answerFileFinish"
  | "answerFileDelete"
  | "answerFilePackBuy"
  | "answerFilePackKaspi"
  | "answerFilePackKaspiStatus"
> = {
  async answerMediaGet({ req, user, input }) {
    const { book, viewer } = await apiBook(req, input.bookId);
    const m = messagesFor(await resolveLocale(user));
    return buildMediaState(book, viewer, input.questionId, m);
  },

  async answerMediaSave({ req, user, input }) {
    const { book, viewer } = await apiBook(req, input.bookId, { editable: true });
    await container().authoring.questions.edit(book.id, viewer, input.questionId, { media: input.body.media });
    const m = messagesFor(await resolveLocale(user));
    return buildMediaState(book, viewer, input.questionId, m);
  },

  async answerMediaAddLink({ req, user, input }) {
    const { book, viewer } = await apiBook(req, input.bookId, { editable: true });
    const m = messagesFor(await resolveLocale(user));
    const t = m.editor.media;
    const parsed = parseMediaUrl(input.body.url);
    if (!parsed) return Response.json({ error: t.badUrl, code: "badUrl" }, { status: 400 });
    const question = await loadQuestion(book.id, input.questionId);
    const current = normalizeMedia((question.media as AnswerMedia[] | null | undefined) ?? []);
    if (current.length >= MAX_MEDIA) return Response.json({ error: t.limit(MAX_MEDIA), code: "tooManyMedia" }, { status: 400 });
    if (current.some((x) => x.url === parsed.url)) return Response.json({ error: t.duplicate, code: "duplicate" }, { status: 400 });
    const title = parsed.youtubeId ? ((await fetchYoutubeOembedTitle(parsed.url)) ?? "") : "";
    const next: AnswerMedia[] = [
      ...current,
      { id: randomUUID(), kind: MUSIC_SOURCES.has(parsed.source) ? "music" : "video", url: parsed.url, title, anchor: null },
    ];
    await container().authoring.questions.edit(book.id, viewer, input.questionId, { media: next });
    return buildMediaState(book, viewer, input.questionId, m);
  },

  async answerFileStart({ req, user, input }) {
    const { book } = await apiBook(req, input.bookId, { editable: true });
    if (!(await rateLimit(`answer-file:${user!.id}`, 30, 3600_000))) throw new HttpError(429, "fileRate");
    const b = input.body;
    const row = await startUpload({ bookId: book.id, userId: user!.id, name: b.name, size: b.size, mime: b.type, declaredSec: b.durationSec });
    const m = messagesFor(await resolveLocale(user));
    return { file: toAnswerFileState(fileView(row), m), chunkBytes: FILE_CHUNK_BYTES };
  },

  async answerFileStatus({ req, user, input }) {
    const { book, file } = await ownedFile(req, input.bookId, input.fileId, false);
    const [quota, m] = await Promise.all([bookFileQuota(book.id), resolveLocale(user).then(messagesFor)]);
    return { file: toAnswerFileState(fileView(file), m), quota: toAnswerFileQuota(quota, m) };
  },

  async answerFileChunk({ req, input }) {
    const { file } = await ownedFile(req, input.bookId, input.fileId, true);
    const chunk = input.files[0];
    if (!chunk) throw new HttpError(400, "fileChunk");
    if (chunk.size > FILE_CHUNK_BYTES) throw new HttpError(413, "fileChunk");
    const bytes = Buffer.from(await chunk.arrayBuffer());
    return { received: await appendChunk(file, input.offset, bytes) };
  },

  async answerFileFinish({ req, user, input }) {
    const { book, file } = await ownedFile(req, input.bookId, input.fileId, true);
    const finished = await finishUpload(file);
    kickAnswerFiles();
    const [quota, m] = await Promise.all([bookFileQuota(book.id), resolveLocale(user).then(messagesFor)]);
    return { file: toAnswerFileState(fileView(finished), m), quota: toAnswerFileQuota(quota, m) };
  },

  async answerFileDelete({ req, input }) {
    const { file } = await ownedFile(req, input.bookId, input.fileId, true);
    await removeFile(file);
    return { ok: true };
  },

  async answerFilePackBuy({ req, user, input }) {
    const { book } = await apiBook(req, input.bookId, { editable: true });
    if (!(await rateLimit(`media-pack:${user!.id}`, 10, 10 * 60_000))) throw new HttpError(429, "kaspiRate");
    await ensureCatalog();
    const pack = getMediaPack(input.body.packId);
    if (!pack || pack.hidden || pack.price <= 0) throw new HttpError(404, "notFound");
    const purchase = await createMediaPurchase(user!.id, book.id, pack);
    const [kaspiProps, m] = await Promise.all([
      kaspiPaymentProps({ kind: "media_pack", id: purchase.id }, user!.phone ?? ""),
      resolveLocale(user).then(messagesFor),
    ]);
    return buildAnswerFilePackPurchase(purchase, kaspiProps, m);
  },

  async answerFilePackKaspi({ req, user, input }) {
    const { book } = await apiBook(req, input.bookId, { editable: true });
    await ownedPurchase(book.id, input.purchaseId, user!.id);
    if (!(await rateLimit(`kaspi-invoice-user:${user!.id}`, 10, 10 * 60_000))) throw new HttpError(429, "kaspiRate");
    const invoice = await container().ordering.kaspi.payMediaPack(input.purchaseId, user!.id, { method: input.body.method, phone: input.body.phone });
    return { invoice: kaspiInvoiceDto(await invoiceView(invoice)) };
  },

  async answerFilePackKaspiStatus({ req, user, input }) {
    const { book } = await apiBook(req, input.bookId);
    await ownedPurchase(book.id, input.purchaseId, user!.id);
    const invoice = await container().ordering.kaspi.status(input.invoiceId, { userId: user!.id });
    const [quota, m] = await Promise.all([bookFileQuota(book.id), resolveLocale(user).then(messagesFor)]);
    return { invoice: kaspiInvoiceDto(await invoiceView(invoice)), quota: toAnswerFileQuota(quota, m) };
  },
};
