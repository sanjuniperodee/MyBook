/**
 * Кабинет автора для приложения «MyBooks»: модели экранов из тех же функций, что рисуют страницы сайта, — подписи на
 * языке пользователя, адреса картинок обложек с версией.
 */
import { messagesFor } from "@/i18n/messages";
import { cabinetBookView, cabinetHelpView, cabinetPhotosView, cabinetShelfView } from "@/lib/cabinet/views";
import { isBookEditableBy } from "@/modules/authoring";
import { apiBook } from "@/server/api";
import { helpAsk, helpThread } from "@/server/book-help";
import { bookHub } from "@/server/book-hub";
import { photosTabData } from "@/server/photos-tab-data";
import { localShelfBooks } from "@/server/v1-local-bridge";
import type { Handlers } from "../app";

export const cabinetHandlers: Pick<Handlers, "cabinetShelf" | "cabinetBook" | "cabinetPhotos" | "cabinetHelp" | "cabinetHelpAsk"> = {
  async cabinetShelf({ user }) {
    const locale = user!.locale === "kk" ? "kk" : "ru";
    const m = messagesFor(locale);
    const books = await localShelfBooks(user!.id, locale, m);
    return cabinetShelfView(books, user!.name, m);
  },

  async cabinetBook({ req, user, input }) {
    const locale = user!.locale === "kk" ? "kk" : "ru";
    const m = messagesFor(locale);
    const { book } = await apiBook(req, input.bookId);
    const h = await bookHub(book, locale, m);
    return cabinetBookView(book, h, locale, m);
  },

  async cabinetPhotos({ req, user, input }) {
    const locale = user!.locale === "kk" ? "kk" : "ru";
    const m = messagesFor(locale);
    const { book, viewer } = await apiBook(req, input.bookId);
    const data = await photosTabData(book, book.status === "draft" && isBookEditableBy(book.userId, viewer), m);
    return cabinetPhotosView(data, m);
  },

  async cabinetHelp({ req, user, input }) {
    const locale = user!.locale === "kk" ? "kk" : "ru";
    const m = messagesFor(locale);
    const { book } = await apiBook(req, input.bookId);
    const thread = await helpThread(book, user!.id);
    return cabinetHelpView(thread, input.section, m);
  },

  async cabinetHelpAsk({ req, user, input }) {
    const locale = user!.locale === "kk" ? "kk" : "ru";
    const { book } = await apiBook(req, input.bookId);
    const r = await helpAsk(book, user!, { text: input.body.text, place: null, human: input.body.human }, locale);
    return { outcome: r.outcome, suggestions: r.suggestions, messages: r.messages };
  },
};
