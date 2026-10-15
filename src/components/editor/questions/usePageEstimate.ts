"use client";

import { useDeferredValue, useMemo } from "react";
import { editorEstimate } from "@/lib/book/editor-estimate";
import { editorHeading, type EditorBook, type EditorPhoto, type EditorQuestion } from "@/lib/book/editor-model";
import { estimateAnswerPages, textMetrics } from "@/lib/book/estimate";
import type { BookFormat } from "@/lib/book/formats";
import type { InteriorDesign } from "@/lib/book/interiors";
import type { LetterLike } from "@/lib/book/layout";

/**
 * Объём книги в редакторе: полос и печатный объём — та же оценка, что в кабинете. Книга берётся отложенной
 * (useDeferredValue): пересчёт всей книги не задерживает ввод и не идёт на каждый символ.
 */
export function useBookPages(book: EditorBook, questions: EditorQuestion[], photos: EditorPhoto[], letters: LetterLike[]) {
  const deferredQuestions = useDeferredValue(questions);
  const deferredPhotos = useDeferredValue(photos);
  return useMemo(() => editorEstimate(book, deferredQuestions, deferredPhotos, letters), [book, deferredQuestions, deferredPhotos, letters]);
}

/** Доля полосы, которую займёт ответ с его фото посреди главы; 0 — ни текста, ни фото. */
export function answerPagesOf(q: EditorQuestion, photos: EditorPhoto[], format: BookFormat, design: InteriorDesign) {
  return q.answer.trim() || photos.length ? estimateAnswerPages(editorHeading(q), q.answer, photos, textMetrics(format, design)) : 0;
}
