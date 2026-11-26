import type { z } from "zod";
import { LETTER_MAX, type Letter, type LetterInvite, type LettersLabels, type LettersView } from "@mybook/contracts";
import { isLocale, localizePath } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { letterShareFor } from "@/i18n/messages/partial";
import { bookKind } from "@/lib/content/kinds";
import { inviteRecipient } from "@/lib/content/letter-invite";
import { isBookEditableBy, type BookViewer } from "../domain/Book";
import { MAX_LETTERS } from "../domain/Letter";
import type { BookRow, LetterRow } from "../infrastructure/queries";

/**
 * Письма близких и приглашение глазами API v1 — общие для mybook-api и бэкенда на Nest (ADR 0014).
 */

export const toLetterDto = (l: LetterRow): z.output<typeof Letter> => ({
  id: l.id,
  authorName: l.authorName,
  relation: l.relation,
  text: l.text,
  status: l.status,
  createdAt: l.createdAt.toISOString(),
});

export function letterInviteDto(book: BookRow, appUrl: string): z.output<typeof LetterInvite> {
  const language = isLocale(book.language) ? book.language : "ru";
  const url = book.inviteToken ? `${appUrl}${localizePath(`/letters/${book.inviteToken}`, language)}` : null;
  const invitation = { kind: bookKind(book.theme), author: book.authorName, title: book.title, recipient: book.recipientName, inviteText: book.inviteText };
  return { enabled: !!url, url, text: book.inviteText, shareText: url ? letterShareFor(language)(invitation, url) : null };
}

/** Надписи экрана писем — как у страницы писем сайта (LettersManager): books.letters, bookStudio.letters, gift.letter. */
export function lettersLabels(book: BookRow, m: Messages): z.output<typeof LettersLabels> {
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

export function buildLettersView(book: BookRow, viewer: BookViewer, letters: readonly LetterRow[], m: Messages, appUrl: string): z.output<typeof LettersView> {
  return {
    letters: letters.map(toLetterDto),
    invite: letterInviteDto(book, appUrl),
    max: MAX_LETTERS,
    editable: book.status === "draft" && isBookEditableBy(book.userId, viewer),
    labels: lettersLabels(book, m),
    limits: { ...LETTER_MAX },
  };
}
