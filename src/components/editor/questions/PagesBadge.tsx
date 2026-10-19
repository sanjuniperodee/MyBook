"use client";

import { BookOpen } from "lucide-react";
import { useMessages } from "@/i18n/client";
import type { EditorBook, EditorChapter, EditorPhoto, EditorQuestion } from "@/lib/book/editor-model";
import type { LetterLike } from "@/lib/book/layout";
import { useBookPages } from "./usePageEstimate";

/**
 * Объём книги в печати — над карточкой вопроса. Отдельный компонент: отложенный пересчёт книги (useBookPages)
 * перерисовывает только его, а не весь редактор.
 */
export function PagesBadge({ book, questions, photos, letters, chapters }: { book: EditorBook; questions: EditorQuestion[]; photos: EditorPhoto[]; letters: LetterLike[]; chapters?: EditorChapter[] }) {
  const t = useMessages().editor;
  const pages = useBookPages(book, questions, photos, letters, chapters);
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-rose/70 px-3 py-1.5 text-xs font-medium text-wine" title={t.pagesEstimate}>
      <BookOpen className="size-3.5" /> {t.pagesShort(pages.printed || 0)}
    </span>
  );
}
