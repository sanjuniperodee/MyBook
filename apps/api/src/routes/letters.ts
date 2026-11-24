/**
 * Письма близких в API v1. Сервисы и правила — как у маршрутов сайта /api/books/[id]/letters*: authoring.letters
 * (правка, скрыть, удалить, порядок) и authoring.books (ссылка приглашения, свой текст). Ссылка и сообщение для
 * «Поделиться» собираются здесь теми же функциями, что у страницы писем (localizePath, letterShareFor).
 */
import type { z } from "zod";
import { LETTER_MAX, type Letter, type LetterInvite } from "@mybook/contracts";
import { env } from "@/config/env";
import { isLocale, localizePath } from "@/i18n/config";
import { letterShareFor } from "@/i18n/messages/partial";
import { bookKind } from "@/lib/content/kinds";
import { inviteRecipient } from "@/lib/content/letter-invite";
import { getMessages } from "@/i18n/server";
import { isBookEditableBy, MAX_LETTERS, type BookRow, type BookViewer } from "@/modules/authoring";
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

const editableOf = (book: BookRow, viewer: BookViewer) => book.status === "draft" && isBookEditableBy(book.userId, viewer);

/** Надписи экрана писем — как у страницы писем сайта (LettersManager): books.letters, bookStudio.letters, gift.letter. */
async function labelsOf(book: BookRow) {
  const m = await getMessages();
  const t = m.books.letters;
  const lt = m.gift.letter;
  const kind = bookKind(book.theme);
  return {
    title: t.title,
    lead: m.bookStudio.letters.lead,
    tabs: t.tabs,
    empty: t.empty,
    emptyText: t.emptyText,
    linkTitle: t.linkTitle,
    linkText: t.linkText,
    copy: t.copy,
    copied: t.copied,
    whatsapp: t.whatsapp,
    inviteText: t.inviteText,
    inviteTextHint: t.inviteTextHint,
    invitePlaceholder: kind === "gift" ? lt.text(book.recipientName.trim(), book.title) : lt.textByKind[kind](book.title),
    privacy: t.privacy(!!inviteRecipient(kind, book.recipientName, book.inviteText)),
    regen: t.regen,
    regenTitle: t.regenTitle,
    regenText: t.regenText,
    regenConfirm: t.regenConfirm,
    close: t.close,
    create: t.create,
    approve: t.approve,
    unapprove: t.unapprove,
    edit: t.edit,
    hide: t.hide,
    delete: m.common.actions.delete,
    deleteTitle: t.deleteTitle,
    deleteText: t.deleteText,
    relation: t.relation,
    moveUp: t.moveUp,
    moveDown: t.moveDown,
    orderHint: t.orderHint,
    readMore: m.bookStudio.letters.readMore,
    save: t.save,
    cancel: t.cancel,
  };
}

async function bookAfterChange(bookId: string): Promise<BookRow> {
  const book = await container().authoring.queries.book(bookId);
  if (!book) throw new HttpError(404, "bookNotFound");
  return book;
}

export const letterHandlers: Pick<Handlers, "lettersGet" | "letterInviteSet" | "letterInviteText" | "lettersReorder" | "letterUpdate" | "letterDelete"> = {
  async lettersGet({ req, input }) {
    const { book, viewer } = await apiBook(req, input.bookId);
    const letters = await container().authoring.queries.letters(book.id);
    return { letters: letters.map(toLetter), invite: inviteOf(book), max: MAX_LETTERS, editable: editableOf(book, viewer), labels: await labelsOf(book), limits: { ...LETTER_MAX } };
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
