import type { Provider } from "@nestjs/common";
import { buildStudioChapters } from "@/modules/authoring/ui/pages-view";
import { PAGES_IMAGE_WIDTHS, PAGES_SPREADS, pagesVersion } from "@/modules/production";
import {
  appendChunk,
  bookFileQuota,
  createMediaPurchase,
  findBookFile,
  findMediaPurchase,
  finishUpload,
  listBookFiles,
  mediaPackOffers,
  removeFile,
  startUpload,
} from "@/server/answerFiles";
import { kickAnswerFiles } from "@/server/answerFilesWorker";
import { syncCatalogFromSettings } from "@/server/catalog";
import type { Container } from "@/server/container";
import { designAiInfo, runDesignAiRequest } from "@/server/design-ai-request";
import { invoiceView, kaspiPaymentProps } from "@/server/kaspi-view";
import { pagesSampleOf, pagesSpreadsOf, storePagesPreview } from "@/server/pages-image";
import { bookSpreadSample } from "@/server/spreadSample";
import {
  ANSWER_FILES_PORTS,
  PAGES_PORTS,
  type AnswerFilesPorts,
  type PagesAiRunResult,
  type PagesPorts,
} from "../modules/authoring-studio/authoring-studio.tokens";
import { LEGACY_CONTAINER } from "./legacy.tokens";

/**
 * Порты Контекста 2B («Authoring: студия полос и медиа/файлы ответов») к старому контейнеру и общим серверным модулям.
 * Ни один вызов здесь не обращается к `next/headers`: язык передаётся явно в `runDesignAiRequest`, каталог обновляется
 * напрямую через `syncCatalogFromSettings`.
 */
export const legacyPagesPorts: Provider<PagesPorts> = {
  provide: PAGES_PORTS,
  useFactory: (c: Container): PagesPorts => ({
    book: (bookId) => c.authoring.queries.book(bookId),
    sampleMeta: async (bookId) => {
      const sample = await pagesSampleOf(bookId);
      if (!sample) return null;
      return {
        version: pagesVersion(sample),
        spreads: pagesSpreadsOf(sample),
        allSpreads: PAGES_SPREADS,
        imageWidths: PAGES_IMAGE_WIDTHS,
      };
    },
    studioChapters: async (bookId) => {
      const bundle = await c.authoring.queries.bundle(bookId);
      return bundle ? buildStudioChapters(bundle) : [];
    },
    chapterCandidates: async (book) => {
      const q = c.authoring.queries;
      const [questions, chapters, photos, letters] = await Promise.all([
        q.questions(book.id),
        q.chapters(book.id),
        q.photos(book.id),
        q.approvedLetters(book.id),
      ]);
      return bookSpreadSample(book, questions, chapters, "", photos, null, letters).tocAll ?? [];
    },
    updateSettings: async (bookId, viewer, patch) => {
      await c.authoring.books.updateSettings(bookId, viewer, patch, c.authoring.photoRepository);
    },
    moveChapter: async (bookId, viewer, input) => {
      await c.authoring.questions.moveChapter(bookId, viewer, input);
    },
    aiInfo: async (userId, book) => {
      const info = await designAiInfo(userId, book);
      return { allowance: info.allowance, hasPhotos: info.hasPhotos };
    },
    runAi: async (user, book, input, locale) => {
      const res = await runDesignAiRequest(
        user,
        book,
        {
          target: "pages",
          mode: input.mode,
          prompt: input.prompt,
          history: input.history,
          state: input.state,
          chapters: input.chapters,
        },
        locale,
      );
      return res as unknown as PagesAiRunResult;
    },
    storePreview: (bookId, override) => storePagesPreview(bookId, override),
  }),
  inject: [LEGACY_CONTAINER],
};

export const legacyAnswerFilesPorts: Provider<AnswerFilesPorts> = {
  provide: ANSWER_FILES_PORTS,
  useFactory: (c: Container): AnswerFilesPorts => ({
    questions: (bookId) => c.authoring.queries.questions(bookId),
    editQuestionMedia: (bookId, viewer, questionId, media) => c.authoring.questions.edit(bookId, viewer, questionId, { media }),
    bookFileQuota: (bookId) => bookFileQuota(bookId),
    listBookFiles: (bookId) => listBookFiles(bookId),
    findBookFile: (bookId, fileId) => findBookFile(bookId, fileId),
    mediaPackOffers: () => mediaPackOffers(),
    kaspiAvailable: () => c.ordering.kaspi.available(),
    startUpload: (input) => startUpload(input),
    appendChunk: (file, offset, bytes) => appendChunk(file, offset, bytes),
    finishUpload: (file) => finishUpload(file),
    kickWorker: () => kickAnswerFiles(),
    removeFile: (file) => removeFile(file),
    ensureCatalog: () => syncCatalogFromSettings(),
    createMediaPurchase: (userId, bookId, pack) => createMediaPurchase(userId, bookId, pack),
    findMediaPurchase: (purchaseId) => findMediaPurchase(purchaseId),
    kaspiPaymentProps: (purchaseId, defaultPhone) => kaspiPaymentProps({ kind: "media_pack", id: purchaseId }, defaultPhone),
    payMediaPack: async (purchaseId, userId, input) => {
      const invoice = await c.ordering.kaspi.payMediaPack(purchaseId, userId, input);
      return invoiceView(invoice);
    },
    kaspiStatus: async (invoiceId, userId) => {
      const invoice = await c.ordering.kaspi.status(invoiceId, { userId });
      return invoiceView(invoice);
    },
  }),
  inject: [LEGACY_CONTAINER],
};

export const legacyAuthoringStudioPorts: Provider[] = [legacyPagesPorts, legacyAnswerFilesPorts];

export const LEGACY_AUTHORING_STUDIO_TOKENS = [PAGES_PORTS, ANSWER_FILES_PORTS] as const;
