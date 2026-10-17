/**
 * Содержимое книги с текстами темы и словаря: названия и эпиграфы глав, «Разное», глава писем, название по
 * умолчанию — на языке книги. Для сервера и PDF; в браузер этот модуль не попадает (тянет словари и темы),
 * редактор собирает книгу assembleBookContent со своими данными.
 */
import { messagesFor } from "@/i18n/messages";
import { bookKind } from "../content/kinds";
import { getTheme } from "../content/themes";
import { assembleBookContent, type BookLike, type BookTexts, type ChapterLike, type LetterLike, type PhotoItem, type QuestionLike } from "./layout";

/**
 * Тексты книги: главы автора (book_chapters, своя книга) — в их порядке и с их названиями, остальные — из темы,
 * потом «Разное»; подписи — из словаря языка книги по её виду. Разделы своей книги, чья глава пропала, собираются
 * в главу «Без названия» в конце книги (а не в «Разное»).
 */
export function bookTexts(book: Pick<BookLike, "theme" | "language">, chapters: readonly ChapterLike[]): BookTexts {
  const theme = getTheme(book.theme, book.language);
  const t = messagesFor(book.language).book;
  const kind = bookKind(book.theme);
  const own = new Map(chapters.map((c) => [c.key, c]));
  return {
    chapter: (key) => {
      const c = own.get(key);
      if (c) return { title: c.title, epigraph: c.epigraph, own: true };
      if (kind === "blank") return { title: "", own: true };
      return theme.chapters.find((x) => x.key === key);
    },
    chapterOrder: kind === "blank" || chapters.length ? chapters.map((c) => c.key) : undefined,
    misc: t.misc,
    untitledChapter: t.untitledChapter,
    letters: t.letters,
    defaultTitle: theme.titleSuggestions[0] || t.untitled,
    galleryTitle: kind === "gift" ? t.gallery : t.galleryByKind[kind],
  };
}

/**
 * Книга для печати, превью, оценки объёма и отпечатка кэша. Главы автора — обязательный вход (у книг с банком — []),
 * чтобы ни одна точка сборки не напечатала свою книгу без её глав.
 */
export function buildBookContent(book: BookLike, questions: QuestionLike[], photos: PhotoItem[], chapters: readonly ChapterLike[], year = new Date().getFullYear(), letters: LetterLike[] = []) {
  return assembleBookContent(book, questions, photos, bookTexts(book, chapters), year, letters);
}
