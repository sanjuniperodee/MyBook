import type { Provider } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { MEDIA_TITLE_MAX } from "@/lib/book/answer-media";
import { coverPhotoResized } from "@/modules/production";
import {
  appendChunk,
  bookFileQuota,
  createMediaPurchase,
  fileView,
  findBookFile,
  findByToken,
  finishUpload,
  listBookFiles,
  mediaKey,
  mediaMime,
  mediaPackOffers,
  openMedia,
  openPoster,
  posterKey,
  removeFile,
  startUpload,
} from "@/server/answerFiles";
import { kickAnswerFiles } from "@/server/answerFilesWorker";
import { helpAsk, helpThread } from "@/server/book-help";
import { syncCatalogFromSettings } from "@/server/catalog";
import { hitClientAi } from "@/server/clientAiLimits";
import type { Container } from "@/server/container";
import { getCoverArt } from "@/server/cover-art";
import { coverImage, coverTemplateThumb } from "@/server/cover-image";
import { designAiInfo, runDesignAiRequest } from "@/server/design-ai-request";
import { createDesignAiPurchase } from "@/server/designAiStore";
import { kaspiPaymentProps } from "@/server/kaspi-view";
import { pagesSpreadImage } from "@/server/pages-image";
import { serveStorageFile } from "@/server/range-file";
import { misspelled } from "@/server/spell";
import {
  AUTHORING_SITE_PORTS,
  type AuthoringSitePorts,
  type SiteAnswerFileRow,
  type StorageStreamInput,
} from "../modules/authoring-site/authoring-site.tokens";
import { LEGACY_CONTAINER } from "./legacy.tokens";

/** Синтетический Request для serveStorageFile/viaFilesService (Range, If-None-Match, signal) без next/headers. */
function storageRequestOf(input: StorageStreamInput): Request {
  const headers = new Headers();
  if (input.range) headers.set("range", input.range);
  if (input.ifNoneMatch) headers.set("if-none-match", input.ifNoneMatch);
  return new Request("http://localhost/", { headers, signal: input.signal });
}

type AnswerFileArg = Parameters<typeof fileView>[0];

/**
 * Адаптер переходного периода для 42 маршрутов сайта Authoring (`AuthoringSiteModule`):
 * связывает порты NestJS со старым контейнером и серверными утилитами без единого вызова `next/headers`.
 */
export const legacyAuthoringSitePorts: Provider<AuthoringSitePorts> = {
  provide: AUTHORING_SITE_PORTS,
  useFactory: (c: Container): AuthoringSitePorts => ({
    bookFileQuota: (bookId) => bookFileQuota(bookId),
    listBookFiles: (bookId) => listBookFiles(bookId),
    findBookFile: (bookId, fileId) => findBookFile(bookId, fileId),
    findAnswerFileByToken: (token) => findByToken(token),
    fileView: (file) => fileView(file as AnswerFileArg),
    mediaPackOffers: () => mediaPackOffers(),
    startUpload: (input) => startUpload(input),
    appendChunk: (file, offset, bytes) => appendChunk(file as AnswerFileArg, offset, bytes),
    finishUpload: (file) => finishUpload(file as AnswerFileArg),
    removeFile: (file) => removeFile(file),
    kickAnswerFiles: () => kickAnswerFiles(),
    createMediaPurchase: (userId, bookId, pack) => createMediaPurchase(userId, bookId, pack),
    serveAnswerPoster: (file, req, headers) =>
      serveStorageFile(posterKey(file as AnswerFileArg), "image/jpeg", storageRequestOf(req), headers, (r) =>
        openPoster(file as AnswerFileArg, r),
      ),
    serveAnswerMedia: (file, req, headers) =>
      serveStorageFile(mediaKey(file as AnswerFileArg), mediaMime(file.kind), storageRequestOf(req), headers, (r) =>
        openMedia(file as AnswerFileArg, r),
      ),

    ensureCatalog: () => syncCatalogFromSettings(),
    kaspiAvailable: () => c.ordering.kaspi.available(),
    kaspiPaymentProps: (target, defaultPhone) => kaspiPaymentProps(target, defaultPhone),
    createDesignAiPurchase: (userId, pack) => createDesignAiPurchase(userId, pack),

    manuscript: (bookId) => c.previews.manuscript(bookId),
    previewPdf: (bookId) => c.previews.preview(bookId),
    pageImage: (bookId, fp, page, width, signal) => c.previews.pageImage(bookId, fp, page, width, signal),
    pagesSpreadImage: (bookId, kind, width, design, preview) => pagesSpreadImage(bookId, kind, width, design, preview),
    coverImage: (book, width, options) => coverImage(book, width, options),
    coverTemplateThumb: (book, template) => coverTemplateThumb(book, template),

    helpThread: (book, userId) => helpThread(book, userId),
    helpAsk: (book, user, input, locale) => helpAsk(book, user, input, locale),
    designAiInfo: (userId, book) => designAiInfo(userId, book),
    runDesignAi: (user, book, input, locale) => runDesignAiRequest(user, book, input, locale),
    hitClientAi: (tool, userId) => hitClientAi(tool, userId),
    proofreadConfigured: () => c.assistant.proofreader.configured(),
    proofreadCheck: (text, bookLanguage, uiLocale, opts) => c.assistant.proofreader.check(text, bookLanguage, uiLocale, opts),
    writerConfigured: () => c.assistant.writer.configured(),
    writerRewrite: (text, mode, bookLanguage, opts) => c.assistant.writer.rewrite(text, mode, bookLanguage, opts),
    misspelled: (words) => misspelled(words),

    servePhotoFile: (key, req, headers) =>
      serveStorageFile(key, "image/jpeg", storageRequestOf(req), headers, (r) => c.authoring.photoStream(key, r)),
    coverArt: (file) => getCoverArt(file),
    coverPhotoResized: (key, width) => coverPhotoResized(key, width),
    readFontFile: (file) => readFile(path.join(process.cwd(), "assets", "fonts", file)).catch(() => null),
    fetchYoutubeTitle: async (videoId) => {
      try {
        const res = await fetch(
          `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`,
          { signal: AbortSignal.timeout(4000) },
        );
        const data: unknown = res.ok ? await res.json() : null;
        const rawTitle = typeof data === "object" && data !== null && "title" in data ? Reflect.get(data, "title") : null;
        const title = typeof rawTitle === "string" ? rawTitle.replace(/\s+/g, " ").trim().slice(0, MEDIA_TITLE_MAX) : null;
        return { ok: true, title: title || null };
      } catch {
        return { ok: false };
      }
    },
  }),
  inject: [LEGACY_CONTAINER],
};

export type { SiteAnswerFileRow };
