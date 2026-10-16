/**
 * Данные редактора вопросов со страницы books/[id]/questions: заголовки глав и вопросов в роде автора
 * и адресата, эпиграфы глав темы, фото и письма. Только для сервера (и стенда): модуль тянет каталог тем,
 * а клиентский редактор берёт из lib/book/editor-model лишь типы и помощники.
 */
import { applyGender } from "@/lib/content/gender";
import { bookKind } from "@/lib/content/kinds";
import { chapterTitle, getTheme } from "@/lib/content/themes";
import type { Book, BookLetter, BookQuestion, Photo } from "@/shared/infrastructure/db/schema";
import type { EditorChapter, EditorPhoto, EditorQuestion } from "./editor-model";
import { CUSTOM_KEY, questionTexts, type ChapterLike, type LetterLike } from "./layout";

type ModelBook = Pick<Book, "theme" | "language" | "authorGender" | "recipientGender" | "coverPhotoId">;
type ModelQuestion = Pick<BookQuestion, "id" | "chapter" | "prompt" | "hint" | "title" | "displayText" | "hideHeading" | "answer" | "questionKey">;
type ModelPhoto = Pick<Photo, "id" | "width" | "height" | "caption" | "layout" | "questionId" | "inline">;
type ModelLetter = Pick<BookLetter, "id" | "authorName" | "relation" | "text">;

/**
 * Что получает редактор от страницы: вопросы с заголовками в роде автора и адресата (свои вопросы и разделы своей книги —
 * как их написал автор), главы, эпиграфы глав (по ключу), фото книги без фото обложки — внутри книги его нет — и письма
 * близких (одобренные): они идут в книгу последней главой. Главы своей книги — из book_chapters (chapters, по порядку,
 * включая пустые; названия — как у автора, без подстановки рода), у книг с банком — главы темы в порядке вопросов.
 */
export function editorModel(book: ModelBook, rows: ModelQuestion[], chapters: readonly ChapterLike[], photos: ModelPhoto[], letters: ModelLetter[] = []) {
  const theme = getTheme(book.theme, book.language);
  const outline = bookKind(book.theme) === "blank";
  const g = (s: string) => applyGender(s, book.authorGender, book.recipientGender);
  const own = new Map(chapters.map((c) => [c.key, c]));
  const titleOf = (key: string) => {
    const c = own.get(key);
    if (c) return c.title;
    return outline ? "" : g(chapterTitle(theme, key, book.language));
  };
  const questions: EditorQuestion[] = rows.map((r) => {
    const t = questionTexts(r, book);
    return {
      id: r.id,
      chapter: r.chapter,
      chapterTitle: titleOf(r.chapter),
      prompt: t.prompt,
      hint: t.hint,
      defaultTitle: t.title,
      displayText: r.displayText,
      hideHeading: r.hideHeading,
      answer: r.answer,
      isCustom: r.questionKey === CUSTOM_KEY,
    };
  });
  const editorChapters: EditorChapter[] = outline
    ? chapters.map((c) => ({ key: c.key, title: c.title, epigraph: c.epigraph, own: true }))
    : [...new Set(rows.map((r) => r.chapter))].map((key) => ({ key, title: titleOf(key), epigraph: theme.chapters.find((c) => c.key === key)?.epigraph ?? "", own: false }));
  const epigraphs: Record<string, string> = Object.fromEntries(editorChapters.flatMap((c) => (c.epigraph ? [[c.key, c.epigraph]] : [])));
  const inside: EditorPhoto[] = photos
    .filter((p) => p.id !== book.coverPhotoId)
    .map((p) => ({ id: p.id, width: p.width, height: p.height, caption: p.caption, layout: p.layout, questionId: p.questionId, inline: p.inline }));
  const bookLetters: LetterLike[] = letters.map((l) => ({ id: l.id, authorName: l.authorName, relation: l.relation, text: l.text }));
  return { questions, chapters: editorChapters, epigraphs, photos: inside, letters: bookLetters };
}
