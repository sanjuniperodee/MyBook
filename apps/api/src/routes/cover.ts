/**
 * Обложка в API v1: настройки книги и конструктор обложки через authoring.books и чистую сборку authoring/ui/coverView.ts
 * (единый источник для mybook-api и бэкенда на Nest, ADR 0014).
 */
import { getLocale } from "@/i18n/server";
import { buildCoverDesignInitPatch, buildCoverDesignResetPatch, buildCoverDesignSavePatch, buildCoverView } from "@/modules/authoring/ui/coverView";
import { apiBook, HttpError } from "@/server/api";
import { container } from "@/server/container";
import type { Handlers } from "../app";

export const coverHandlers: Pick<Handlers, "coverGet" | "coverUpdate" | "coverDesignSave" | "coverDesignInit" | "coverDesignReset"> = {
  async coverGet({ req, input }) {
    const { book, viewer } = await apiBook(req, input.bookId);
    return buildCoverView(book, viewer, await getLocale());
  },

  async coverUpdate({ req, input }) {
    const { viewer } = await apiBook(req, input.bookId, { editable: true });
    const authoring = container().authoring;
    await authoring.books.updateSettings(input.bookId, viewer, input.body, authoring.photoRepository);
    const book = await authoring.queries.book(input.bookId);
    return buildCoverView(book!, viewer, await getLocale());
  },

  async coverDesignSave({ req, input }) {
    const { viewer } = await apiBook(req, input.bookId, { editable: true });
    const authoring = container().authoring;
    const patch = buildCoverDesignSavePatch(input.body);
    await authoring.books.updateSettings(input.bookId, viewer, patch, authoring.photoRepository);
    const book = await authoring.queries.book(input.bookId);
    return buildCoverView(book!, viewer, await getLocale());
  },

  async coverDesignInit({ req, input }) {
    const { book, viewer } = await apiBook(req, input.bookId, { editable: true });
    const authoring = container().authoring;
    const built = await buildCoverDesignInitPatch(book, input.body, () => authoring.queries.photos(book.id));
    if (!built.ok) throw new HttpError(400, "badRequest");
    if (built.patch) await authoring.books.updateSettings(input.bookId, viewer, built.patch, authoring.photoRepository);
    const updated = await authoring.queries.book(input.bookId);
    return buildCoverView(updated!, viewer, await getLocale());
  },

  async coverDesignReset({ req, input }) {
    const { book, viewer } = await apiBook(req, input.bookId, { editable: true });
    const authoring = container().authoring;
    const patch = buildCoverDesignResetPatch(book, input.body);
    await authoring.books.updateSettings(input.bookId, viewer, patch, authoring.photoRepository);
    const updated = await authoring.queries.book(input.bookId);
    return buildCoverView(updated!, viewer, await getLocale());
  },
};
