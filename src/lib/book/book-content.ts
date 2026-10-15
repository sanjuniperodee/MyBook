/**
 * Содержимое книги с текстами темы и словаря: названия и эпиграфы глав, «Разное», глава писем, название по
 * умолчанию — на языке книги. Для сервера и PDF; в браузер этот модуль не попадает (тянет словари и темы),
 * редактор собирает книгу assembleBookContent со своими данными.
 */
import { messagesFor } from "@/i18n/messages";
import { getTheme } from "../content/themes";
import { assembleBookContent, type BookLike, type BookTexts, type LetterLike, type PhotoItem, type QuestionLike } from "./layout";

/** Тексты книги из её темы и словаря её языка. */
export function bookTexts(book: Pick<BookLike, "theme" | "language">): BookTexts {
  const theme = getTheme(book.theme, book.language);
  const t = messagesFor(book.language).book;
  return {
    chapter: (key) => theme.chapters.find((c) => c.key === key),
    misc: t.misc,
    letters: t.letters,
    defaultTitle: theme.titleSuggestions[0],
  };
}

export function buildBookContent(book: BookLike, questions: QuestionLike[], photos: PhotoItem[], year = new Date().getFullYear(), letters: LetterLike[] = []) {
  return assembleBookContent(book, questions, photos, bookTexts(book), year, letters);
}
