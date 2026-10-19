/**
 * Имена на обложке (лицо, корешок, оборот «Лаконично») — одна функция для PDF, 3D, редактора обложки и списков книг.
 * Лёгкий модуль: без каталога обложек, его можно звать и в браузере.
 */
import { bookKind } from "../content/kinds";

/** Своя строка имён на обложке — не длиннее двух имён с фамилиями. */
export const NAMES_ON_COVER_MAX = 120;

/** «Автор & Получатель»; получатель пустой или скрыт — только автор. */
export function coverNamesLine(author: string, recipient: string, hideRecipient: boolean) {
  const a = author.trim();
  const r = recipient.trim();
  if (hideRecipient || !r) return a;
  if (!a) return r;
  return `${a} & ${r}`;
}

/**
 * Имена на обложке: своя строка автора (namesOnCover), если он её вписал; иначе по виду книги — у автобиографии только
 * автор (рассказчик): получателя у неё нет, а «детям и внукам» — это посвящение; у подарка и своей книги — автор
 * и (если есть и не скрыт) получатель.
 */
export function coverNames(book: { theme: string; authorName: string; recipientName: string; hideRecipientOnCover: boolean; namesOnCover?: string }) {
  const own = book.namesOnCover?.trim();
  if (own) return own;
  return bookKind(book.theme) === "autobiography" ? book.authorName.trim() : coverNamesLine(book.authorName, book.recipientName, book.hideRecipientOnCover);
}
