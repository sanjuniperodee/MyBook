"use client";

import { useDeferredValue, useMemo } from "react";
import { contentPages, editorContent } from "@/lib/book/editor-estimate";
import { editorHeading, type EditorBook, type EditorChapter, type EditorPhoto, type EditorQuestion } from "@/lib/book/editor-model";
import { estimateAnswerPages, textMetrics } from "@/lib/book/estimate";
import type { BookFormat } from "@/lib/book/formats";
import type { InteriorDesign } from "@/lib/book/interiors";
import type { BookContent, LetterLike } from "@/lib/book/layout";
import { photoPlaceOf, type PhotoPlace } from "@/lib/book/photo-place";

/** Книга в редакторе: что напечатается, сколько полос и где стоит каждое фото. */
export interface BookContentView {
  /** Содержимое книги — та же сборка, что у PDF (editorContent): главы, фото главы, фото после глав, альбом. */
  content: BookContent;
  /** Полос по оценке и печатный объём — как в кабинете. */
  pages: { raw: number; printed: number };
  /** Место каждого фото (photoPlaceOf) — для подписей мест, листов выбора и предупреждений; ключи глав не сравнивать. */
  places: Map<string, PhotoPlace>;
}

/**
 * Последняя сборка: счётчик полос, превью и подписи мест в разных компонентах получают одну сборку на правку, а не
 * по своей (входы — те же объекты: состояние редактора и отложенные вопросы).
 */
let last: { args: readonly unknown[]; content: BookContent } | null = null;

function assemble(book: EditorBook, questions: EditorQuestion[], photos: EditorPhoto[], letters: LetterLike[], chapters: readonly EditorChapter[] | undefined) {
  const args = [book, questions, photos, letters, chapters];
  if (last && args.every((a, i) => a === last!.args[i])) return last.content;
  const content = editorContent(book, questions, photos, letters, chapters);
  last = { args, content };
  return content;
}

/**
 * Книга в редакторе — одна сборка для превью, счётчика полос и мест фото (R9). Вопросы берутся отложенными
 * (useDeferredValue): пересчёт всей книги не задерживает ввод и не идёт на каждый символ. Места фото — тот же объект,
 * пока они не изменились: правка текста не перерисовывает подписи мест и листы. chapters — главы редактора у любой
 * книги (у своей — порядок и пустые главы, у книг с банком — эпиграфы начальных полос превью).
 */
export function useBookContent(book: EditorBook, questions: EditorQuestion[], photos: EditorPhoto[], letters: LetterLike[], chapters?: readonly EditorChapter[]): BookContentView {
  const deferredQuestions = useDeferredValue(questions);
  const content = useMemo(() => assemble(book, deferredQuestions, photos, letters, chapters), [book, deferredQuestions, photos, letters, chapters]);
  const pages = useMemo(() => contentPages(content), [content]);
  // Места — по значению: строка мест меняется, только когда фото переехало (или глава появилась и пропала).
  const placesKey = useMemo(() => JSON.stringify([...photoPlaceOf(content, photos, book)]), [content, photos, book]);
  const places = useMemo(() => new Map<string, PhotoPlace>(JSON.parse(placesKey)), [placesKey]);
  return useMemo(() => ({ content, pages, places }), [content, pages, places]);
}

/** Объём книги в редакторе: полос и печатный объём — та же оценка, что в кабинете (useBookContent). */
export function useBookPages(book: EditorBook, questions: EditorQuestion[], photos: EditorPhoto[], letters: LetterLike[], chapters?: readonly EditorChapter[]) {
  return useBookContent(book, questions, photos, letters, chapters).pages;
}

/** Доля полосы, которую займёт ответ с его фото посреди главы; 0 — ни текста, ни фото. */
export function answerPagesOf(q: EditorQuestion, photos: EditorPhoto[], format: BookFormat, design: InteriorDesign) {
  return q.answer.trim() || photos.length || q.media.length ? estimateAnswerPages(editorHeading(q), q.answer, photos, textMetrics(format, design), q.media) : 0;
}
