/**
 * Имена на обложке (лицо, корешок, оборот «Лаконично») — одна функция для PDF, 3D, редактора обложки и списков книг.
 * Лёгкий модуль: без каталога обложек, его можно звать и в браузере.
 */
import { bookKind } from "../content/kinds";

/** «Автор & Получатель»; получатель пустой или скрыт — только автор. */
export function coverNamesLine(author: string, recipient: string, hideRecipient: boolean) {
  const a = author.trim();
  const r = recipient.trim();
  if (hideRecipient || !r) return a;
  if (!a) return r;
  return `${a} & ${r}`;
}

/**
 * Имена на обложке по виду книги: у автобиографии — только автор (рассказчик): получателя у неё нет, а «детям
 * и внукам» — это посвящение; у подарка и своей книги — автор и (если есть и не скрыт) получатель.
 */
export function coverNames(book: { theme: string; authorName: string; recipientName: string; hideRecipientOnCover: boolean }) {
  return bookKind(book.theme) === "autobiography" ? book.authorName.trim() : coverNamesLine(book.authorName, book.recipientName, book.hideRecipientOnCover);
}
