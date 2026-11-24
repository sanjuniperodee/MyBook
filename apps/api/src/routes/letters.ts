/**
 * Письма близких в API v1. Сервисы и правила — как у маршрутов сайта /api/books/[id]/letters*: authoring.letters
 * (правка, скрыть, удалить, порядок) и authoring.books (ссылка приглашения, свой текст). Ссылка и сообщение для
 * «Поделиться» собираются здесь теми же функциями, что у страницы писем (localizePath, letterShareFor).
 */
import type { z } from "zod";
import type { Letter, LetterInvite } from "@mybook/contracts";
import { env } from "@/config/env";
import { isLocale, localizePath } from "@/i18n/config";
import { letterShareFor } from "@/i18n/messages/partial";
import { bookKind } from "@/lib/content/kinds";
import { MAX_LETTERS, type BookRow } from "@/modules/authoring";
import { apiBook, apiViewer, HttpError } from "@/server/api";
import { container } from "@/server/container";
import type { Handlers } from "../app";

type LetterRow = Awaited<ReturnType<ReturnType<typeof container>["authoring"]["queries"]["letters"]>>[number];

const toLetter = (l: LetterRow): z.output<typeof Letter> => ({ id: l.id, authorName: l.authorName, relation: l.relation, text: l.text, status: l.status, createdAt: l.createdAt.toISOString() });

function inviteOf(book: BookRow): z.output<typeof LetterInvite> {
  const language = isLocale(book.language) ? book.language : "ru";
  const url = book.inviteToken ? `${env.appUrl}${localizePath(`/letters/${book.inviteToken}`, language)}` : null;
  const invitation = { kind: bookKind(book.theme), author: book.authorName, title: book.title, recipient: book.recipientName, inviteText: book.inviteText };
  return { enabled: !!url, url, text: book.inviteText, shareText: url ? letterShareFor(language)(invitation, url) : null };
}

async function bookAfterChange(bookId: string): Promise<BookRow> {
  const book = await container().authoring.queries.book(bookId);
  if (!book) throw new HttpError(404, "bookNotFound");
  return book;
}

export const letterHandlers: Pick<Handlers, "lettersGet" | "letterInviteSet" | "letterInviteText" | "lettersReorder" | "letterUpdate" | "letterDelete"> = {
  async lettersGet({ req, input }) {
    const { book } = await apiBook(req, input.bookId);
    const letters = await container().authoring.queries.letters(book.id);
    return { letters: letters.map(toLetter), invite: inviteOf(book), max: MAX_LETTERS };
  },

  async letterInviteSet({ req, input }) {
    const { viewer } = await apiViewer(req, input.bookId);
    await container().authoring.books.setLetterInvite(input.bookId, viewer, input.body.enabled, !!input.body.regenerate);
    return inviteOf(await bookAfterChange(input.bookId));
  },

  async letterInviteText({ req, input }) {
    const { viewer } = await apiViewer(req, input.bookId);
    const authoring = container().authoring;
    await authoring.books.updateSettings(input.bookId, viewer, { inviteText: input.body.text }, authoring.photoRepository);
    return inviteOf(await bookAfterChange(input.bookId));
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
    return { letter: toLetter(letter) };
  },

  async letterDelete({ req, input }) {
    const { viewer } = await apiViewer(req, input.bookId);
    await container().authoring.letters.delete(input.bookId, viewer, input.letterId);
    return { ok: true };
  },
};
