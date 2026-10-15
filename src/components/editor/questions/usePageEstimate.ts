"use client";

import { useMemo } from "react";
import { editorEstimate } from "@/lib/book/editor-estimate";
import { editorHeading, type EditorBook, type EditorPhoto, type EditorQuestion } from "@/lib/book/editor-model";
import { estimateAnswerPages, textMetrics } from "@/lib/book/estimate";
import type { BookFormat } from "@/lib/book/formats";
import type { InteriorDesign } from "@/lib/book/interiors";
import type { LetterLike } from "@/lib/book/layout";

/**
 * Объём книги в редакторе (полос и печатный объём — та же оценка, что в кабинете) и доля полосы, которую
 * займёт текущий ответ с его фото.
 */
export function usePageEstimate({
  book,
  format,
  design,
  questions,
  photos,
  letters,
  current,
}: {
  book: EditorBook;
  format: BookFormat;
  design: InteriorDesign;
  questions: EditorQuestion[];
  photos: EditorPhoto[];
  letters: LetterLike[];
  current: EditorQuestion;
}) {
  const pages = useMemo(() => editorEstimate(book, questions, photos, letters), [book, questions, photos, letters]);
  const currentPhotos = photos.filter((p) => p.questionId === current.id);
  const answerPages = current.answer.trim() || currentPhotos.length ? estimateAnswerPages(editorHeading(current), current.answer, currentPhotos, textMetrics(format, design)) : 0;
  return { pages, answerPages };
}
