/**
 * Письма близких в API v1. Сервисы и правила — как у маршрутов сайта /api/books/[id]/letters*: authoring.letters
 * (правка, скрыть, удалить, порядок) и authoring.books (ссылка приглашения, свой текст). Сборка DTO — в authoring/ui/lettersView.ts.
 */
import { env } from "@/config/env";
import { getMessages } from "@/i18n/server";
import type { BookRow } from "@/modules/authoring";
import { buildLettersView, letterInviteDto, toLetterDto } from "@/modules/authoring/ui/lettersView";
import { apiBook, apiViewer, HttpError } from "@/server/api";
import { container } from "@/server/container";
import type { Handlers } from "../app";

async function bookAfterChange(bookId: string): Promise<BookRow> {
  const book = await container().authoring.queries.book(bookId);
  if (!book) throw new HttpError(404, "bookNotFound");
  return book;
}

export const letterHandlers: Pick<Handlers, "lettersGet" | "letterInviteSet" | "letterInviteText" | "lettersReorder" | "letterUpdate" | "letterDelete"> = {
  async lettersGet({ req, input }) {
    const { book, viewer } = await apiBook(req, input.bookId);
    const letters = await container().authoring.queries.letters(book.id);
    return buildLettersView(book, viewer, letters, await getMessages(), env.appUrl);
  },

  async letterInviteSet({ req, input }) {
    const { viewer } = await apiViewer(req, input.bookId);
    await container().authoring.books.setLetterInvite(input.bookId, viewer, input.body.enabled, !!input.body.regenerate);
    return letterInviteDto(await bookAfterChange(input.bookId), env.appUrl);
  },

  async letterInviteText({ req, input }) {
    const { viewer } = await apiViewer(req, input.bookId);
    const authoring = container().authoring;
    await authoring.books.updateSettings(input.bookId, viewer, { inviteText: input.body.text }, authoring.photoRepository);
    return letterInviteDto(await bookAfterChange(input.bookId), env.appUrl);
  },

  async lettersReorder({ req, input }) {
    const { viewer } = await apiViewer(req, input.bookId);
    await container().authoring.letters.reorder(input.bookId, viewer, input.body.ids);
    return { ok: true };
  },

  async letterUpdate({ req, input }) {
    const { viewer } = await apiViewer(req, input.bookId);
    const authoring = container().authoring;
    await authoring.letters.edit(input.bookId, viewer, input.letterId, input.body);
    const letter = (await authoring.queries.letters(input.bookId)).find((l) => l.id === input.letterId);
    if (!letter) throw new HttpError(404, "notFound");
    return { letter: toLetterDto(letter) };
  },

  async letterDelete({ req, input }) {
    const { viewer } = await apiViewer(req, input.bookId);
    await container().authoring.letters.delete(input.bookId, viewer, input.letterId);
    return { ok: true };
  },
};
