/**
 * Данные редактора вопросов со страницы books/[id]/questions: заголовки глав и вопросов в роде автора
 * и адресата, эпиграфы глав темы, фото и письма. Только для сервера (и стенда): модуль тянет каталог тем,
 * а клиентский редактор берёт из lib/book/editor-model лишь типы и помощники.
 */
import { applyGender } from "@/lib/content/gender";
import { bookKind } from "@/lib/content/kinds";
import { chapterTitle, getTheme } from "@/lib/content/themes";
import type { Book, BookLetter, BookQuestion } from "@/shared/infrastructure/db/schema";
import { coverPlaceOf, toEditorPhoto, type EditorBook, type EditorChapter, type EditorPhoto, type EditorPhotoRow, type EditorQuestion } from "./editor-model";
import { normalizeMedia } from "./answer-media";
import { shownCoverPhotos, type CoverSettings } from "./cover-photos";
import { coverPhotosOf, CUSTOM_KEY, questionTexts, type ChapterLike, type CoverPhotos, type LetterLike } from "./layout";

/** Книга для модели: тема, язык, род; шаблон обложки и оборот — чтобы знать, какие снимки на них видны. */
type ModelBook = Pick<Book, "theme" | "language" | "authorGender" | "recipientGender" | "coverPhotoId"> & Partial<CoverSettings>;
type ModelQuestion = Pick<BookQuestion, "id" | "chapter" | "prompt" | "hint" | "title" | "displayText" | "hideHeading" | "answer" | "questionKey"> & Partial<Pick<BookQuestion, "media">>;
type ModelLetter = Pick<BookLetter, "id" | "authorName" | "relation" | "text">;

/**
 * Снимки, которые обложка и оборот печатают на самом деле (cover-photos.ts) — как их считает buildBookContent для PDF и
 * кабинета. Без шаблона и оборота (неполная строка книги) — все выбранные для них снимки.
 */
export function editorCoverPhotos(book: ModelBook, photoIds: Iterable<string>): CoverPhotos {
  const { coverTemplate, backLayout, backText } = book;
  if (coverTemplate === undefined || backLayout === undefined || backText === undefined) return coverPhotosOf(book);
  return shownCoverPhotos({ coverTemplate, backLayout, backText, coverPhotoId: book.coverPhotoId, coverPhotoExtra: book.coverPhotoExtra ?? [], backPhotoId: book.backPhotoId ?? null, backPhotoExtra: book.backPhotoExtra ?? [] }, photoIds);
}

/**
 * Что получает редактор от страницы: вопросы с заголовками в роде автора и адресата (свои вопросы и разделы своей книги —
 * как их написал автор), главы, эпиграфы глав (по ключу), все фото книги — с кадром, местом, выбранным автором, и
 * отметкой «на обложке» (снимок обложки тоже: у фото одно место, обложка его не забирает; печатается ли он внутри,
 * решает сборка) — и письма близких (одобренные): они идут в книгу последней главой. coverPhotos — снимки, видные на
 * обложке и обороте: страница кладёт их в EditorBook. Главы своей книги — из book_chapters (chapters, по порядку,
 * включая пустые; названия — как у автора, без подстановки рода), у книг с банком — главы темы в порядке вопросов.
 */
export function editorModel(book: ModelBook, rows: ModelQuestion[], chapters: readonly ChapterLike[], photos: EditorPhotoRow[], letters: ModelLetter[] = []) {
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
      media: normalizeMedia(r.media),
      isCustom: r.questionKey === CUSTOM_KEY,
    };
  });
  const editorChapters: EditorChapter[] = outline
    ? chapters.map((c) => ({ key: c.key, title: c.title, epigraph: c.epigraph, own: true }))
    : [...new Set(rows.map((r) => r.chapter))].map((key) => ({ key, title: titleOf(key), epigraph: theme.chapters.find((c) => c.key === key)?.epigraph ?? "", own: false }));
  const epigraphs: Record<string, string> = Object.fromEntries(editorChapters.flatMap((c) => (c.epigraph ? [[c.key, c.epigraph]] : [])));
  const coverPhotos = editorCoverPhotos(book, photos.map((p) => p.id));
  const bookPhotos: EditorPhoto[] = photos.map((p) => toEditorPhoto(p, coverPlaceOf(p.id, coverPhotos)));
  const bookLetters: LetterLike[] = letters.map((l) => ({ id: l.id, authorName: l.authorName, relation: l.relation, text: l.text }));
  return { questions, chapters: editorChapters, epigraphs, photos: bookPhotos, letters: bookLetters, coverPhotos };
}

/** Строка книги, из которой страница готовит EditorBook. */
export type EditorBookRow = Pick<
  Book,
  | "id"
  | "format"
  | "interior"
  | "interiorStyle"
  | "dedication"
  | "showToc"
  | "tocMode"
  | "tocLines"
  | "photoPlacement"
  | "title"
  | "language"
  | "authorName"
  | "recipientName"
  | "recordedBy"
  | "theme"
  | "authorGender"
  | "recipientGender"
  | "layoutRev"
  | "coverPhotoId"
  | "coverPhotoExtra"
  | "backPhotoId"
  | "backPhotoExtra"
>;

/**
 * Книга для редактора: оформление, оглавление, правила раскладки фото и снимки обложки — всё, с чем сборка в браузере
 * (editorContent) соберёт ту же книгу, что PDF и кабинет. coverPhotos — из editorModel.
 */
export function editorBook(book: EditorBookRow, coverPhotos: CoverPhotos): EditorBook {
  return {
    id: book.id,
    format: book.format,
    interior: book.interior,
    interiorStyle: book.interiorStyle,
    dedication: book.dedication,
    showToc: book.showToc,
    tocMode: book.tocMode,
    tocLines: book.tocLines,
    photoPlacement: book.photoPlacement,
    title: book.title,
    language: book.language,
    // Имена на книге (и «кто записал» у автобиографии) проверка орфографии не отмечает.
    names: [book.authorName, book.recipientName, book.recordedBy].filter(Boolean),
    theme: book.theme,
    kind: bookKind(book.theme),
    authorGender: book.authorGender,
    recipientGender: book.recipientGender,
    layoutRev: book.layoutRev,
    coverPhotoId: book.coverPhotoId,
    coverPhotoExtra: book.coverPhotoExtra,
    backPhotoId: book.backPhotoId,
    backPhotoExtra: book.backPhotoExtra,
    coverPhotos,
  };
}
