/**
 * Обложка в API v1: настройки книги через тот же сервис, что у страницы обложки сайта (authoring.books.updateSettings),
 * каталог — тот же выбор (pickerCovers, без убранных), названия и миниатюры — те же функции, что у сайта.
 */
import type { z } from "zod";
import type { Cover, CoverTemplate } from "@mybook/contracts";
import { coverName } from "@/i18n/labels";
import { getLocale } from "@/i18n/server";
import { coverPhotoIds, coverPhotoSlots, pickerCovers, type CoverTemplate as Template } from "@/lib/book/covers";
import { coverArtUrl } from "@/lib/urls";
import { isBookEditableBy, type BookRow, type BookViewer } from "@/modules/authoring";
import { apiBook } from "@/server/api";
import { container } from "@/server/container";
import { coverImageVersion } from "@/server/cover-image";
import type { Handlers } from "../app";

const toTemplate = (t: Template, format: string, locale: "ru" | "kk"): z.output<typeof CoverTemplate> => ({
  id: t.id,
  name: coverName(t.id, locale),
  mood: t.mood,
  photoSlots: coverPhotoSlots(t),
  previewUrl: coverArtUrl(t, format, true),
});

const toCover = (b: BookRow, viewer: BookViewer): z.output<typeof Cover> => ({
  template: b.coverTemplate,
  lines: b.coverLines,
  title: b.title,
  subtitle: b.subtitle,
  namesOnCover: b.namesOnCover,
  hideRecipientOnCover: b.hideRecipientOnCover,
  photoIds: coverPhotoIds(b),
  backText: b.backText,
  backLayout: b.backLayout,
  backPhotoId: b.backPhotoId,
  hasDesign: b.coverDesign !== null,
  imageUrl: `/api/books/${b.id}/cover-image?v=${coverImageVersion(b)}`,
  editable: b.status === "draft" && isBookEditableBy(b.userId, viewer),
});

async function view(book: BookRow, viewer: BookViewer) {
  const locale = (await getLocale()) === "kk" ? "kk" : "ru";
  return { cover: toCover(book, viewer), templates: pickerCovers().filter((t) => !t.hidden).map((t) => toTemplate(t, book.format, locale)) };
}

export const coverHandlers: Pick<Handlers, "coverGet" | "coverUpdate"> = {
  async coverGet({ req, input }) {
    const { book, viewer } = await apiBook(req, input.bookId);
    return view(book, viewer);
  },

  async coverUpdate({ req, input }) {
    const { viewer } = await apiBook(req, input.bookId, { editable: true });
    const authoring = container().authoring;
    await authoring.books.updateSettings(input.bookId, viewer, input.body, authoring.photoRepository);
    const book = await authoring.queries.book(input.bookId);
    return view(book!, viewer);
  },
};
