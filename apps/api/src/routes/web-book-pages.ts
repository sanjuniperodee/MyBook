/**
 * Обработчики страниц и оболочки редактора книги API v1 (ADR 0012, Раздел 2A, section: "book").
 * Делегируют единым сборщикам `src/server/v1-local-bridge-book.ts`, проверяя доступ через `apiBook`.
 */
import { isLocale, type Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import { apiBook } from "@/server/api";
import {
  localBookHubDto,
  localBookShellNav,
  localCoverPageDto,
  localLettersPageDto,
  localPagesPageDto,
  localPhotosPageDto,
  localPreviewPageDto,
  localQuestionsPageDto,
  toWebBookRow,
} from "@/server/v1-local-bridge-book";
import type { Handlers } from "../app";

async function resolveLocale(raw?: string): Promise<Locale> {
  if (isLocale(raw)) return raw;
  const fromReq = await getLocale();
  return isLocale(fromReq) ? fromReq : "ru";
}

export const webBookPagesHandlers: Pick<
  Handlers,
  | "webBook"
  | "webBookHub"
  | "webBookNav"
  | "webBookQuestionsPage"
  | "webBookPhotosPage"
  | "webBookLettersPage"
  | "webBookCoverPage"
  | "webBookPagesPage"
  | "webBookPreviewPage"
> = {
  async webBook({ req, input }) {
    const { book } = await apiBook(req, input.bookId);
    return { book: toWebBookRow(book) };
  },

  async webBookHub({ req, input }) {
    const { book } = await apiBook(req, input.bookId);
    const locale = await resolveLocale(input.locale);
    return localBookHubDto(book, locale, messagesFor(locale));
  },

  async webBookNav({ req, input }) {
    const { book } = await apiBook(req, input.bookId);
    const locale = await resolveLocale(input.locale);
    return localBookShellNav(book, locale);
  },

  async webBookQuestionsPage({ req, input }) {
    const { book, viewer } = await apiBook(req, input.bookId);
    return localQuestionsPageDto(book, viewer);
  },

  async webBookPhotosPage({ req, input }) {
    const { book, viewer } = await apiBook(req, input.bookId);
    const locale = await resolveLocale(input.locale);
    return localPhotosPageDto(book, viewer, messagesFor(locale));
  },

  async webBookLettersPage({ req, input }) {
    const { book } = await apiBook(req, input.bookId);
    return localLettersPageDto(book.id);
  },

  async webBookCoverPage({ req, input }) {
    const { book } = await apiBook(req, input.bookId);
    const locale = await resolveLocale(input.locale);
    return localCoverPageDto(book, locale, messagesFor(locale));
  },

  async webBookPagesPage({ req, input }) {
    const { book, viewer } = await apiBook(req, input.bookId);
    const locale = await resolveLocale(input.locale);
    return localPagesPageDto(book, viewer, messagesFor(locale));
  },

  async webBookPreviewPage({ req, input }) {
    const { book, viewer } = await apiBook(req, input.bookId);
    return localPreviewPageDto(book, viewer);
  },
};
