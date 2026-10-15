/**
 * Модель редактора вопросов: вопросы и фото в том виде, в каком их показывает редактор, главы превью.
 * Один код для страницы books/[id]/questions, самого QuestionsEditor и стенда html-snapshot (scripts/visual).
 * Данные со страницы готовит editorModel (editor-data.ts) — он тянет каталог тем и в браузер не попадает.
 */
import type { Locale } from "@/i18n/config";
import { photoUrl } from "@/lib/urls";
import type { Book, InlinePhotoStyle } from "@/shared/infrastructure/db/schema";

export interface EditorQuestion {
  id: string;
  chapter: string;
  chapterTitle: string;
  prompt: string;
  hint: string | null;
  defaultTitle: string;
  displayText: string | null;
  hideHeading: boolean;
  answer: string;
  isCustom: boolean;
}

export interface EditorPhoto {
  id: string;
  width: number;
  height: number;
  caption: string;
  layout: "full" | "bleed" | "half" | "grid";
  questionId: string | null;
  inline?: InlinePhotoStyle | null;
  /** Счётчик поворотов — сбрасывает кэш картинки в браузере. */
  rev?: number;
}

export interface EditorBook {
  id: string;
  format: string;
  /** Оформление страниц — id из lib/book/interiors. */
  interior: string;
  dedication: string;
  showToc: boolean;
  photoPlacement: "chapters" | "end";
  title: string;
  /** Язык книги: вопросы, заголовки и превью — на нём; интерфейс редактора — на языке сайта. */
  language: Locale;
  /** Имена автора и адресата — проверка орфографии их не отмечает. */
  names?: string[];
  /** Тема и род автора и адресата: по ним собирается содержимое книги для оценки объёма (главы темы, заголовки вопросов). */
  theme: Book["theme"];
  authorGender: Book["authorGender"];
  recipientGender: Book["recipientGender"];
}

export interface PreviewPhoto {
  id: string;
  url: string;
  width: number;
  height: number;
  caption: string;
  inline?: InlinePhotoStyle | null;
}

/** Ответ в вёрстке превью: заголовок, текст и фото в ответе. */
export interface PreviewEntry {
  id: string;
  heading: string | null;
  answer: string;
  photos: PreviewPhoto[];
}

export interface PreviewChapter {
  key: string;
  number: number;
  title: string;
  epigraph?: string;
  entries: PreviewEntry[];
}

/** Подряд идущие вопросы одной главы; i — номер вопроса в списке редактора. */
export interface ChapterGroup {
  key: string;
  title: string;
  items: { q: EditorQuestion; i: number }[];
}

/** Заголовок вопроса в книге: свой текст автора, иначе заголовок вопроса; null — заголовок скрыт. */
export function editorHeading(q: Pick<EditorQuestion, "hideHeading" | "displayText" | "defaultTitle">) {
  return q.hideHeading ? null : (q.displayText ?? q.defaultTitle);
}

export function editorPhotoUrl(p: Pick<EditorPhoto, "id" | "rev">) {
  return photoUrl(p.id) + (p.rev ? `&v=${p.rev}` : "");
}

export function groupByChapter(questions: EditorQuestion[]): ChapterGroup[] {
  const groups: ChapterGroup[] = [];
  questions.forEach((q, i) => {
    let g = groups[groups.length - 1];
    if (!g || g.key !== q.chapter) groups.push((g = { key: q.chapter, title: q.chapterTitle, items: [] }));
    g.items.push({ q, i });
  });
  return groups;
}

/**
 * Вся книга для превью: главы только с заполненными ответами или фото (как в PDF) плюс текущий вопрос, даже пустой.
 * Фото — только вставленные в ответы.
 */
export function previewChapters(groups: ChapterGroup[], photos: EditorPhoto[], epigraphs: Record<string, string>, currentId: string): PreviewChapter[] {
  const toPhoto = (p: EditorPhoto): PreviewPhoto => ({ id: p.id, url: editorPhotoUrl(p), width: p.width, height: p.height, caption: p.caption, inline: p.inline });
  const chapters: PreviewChapter[] = [];
  for (const g of groups) {
    const entries = g.items
      .map(({ q }) => ({ q, ph: photos.filter((p) => p.questionId === q.id) }))
      .filter(({ q, ph }) => q.id === currentId || q.answer.trim() || ph.length)
      .map(({ q, ph }) => ({ id: q.id, heading: editorHeading(q), answer: q.answer, photos: ph.map(toPhoto) }));
    if (entries.length) chapters.push({ key: g.key, number: chapters.length + 1, title: g.title, epigraph: epigraphs[g.key], entries });
  }
  return chapters;
}
