"use client";

import { useDeferredValue, useMemo, type ComponentProps } from "react";
import { useMessages } from "@/i18n/client";
import { groupByChapter, previewChapters, type EditorChapter, type EditorPhoto, type EditorQuestion } from "@/lib/book/editor-model";
import { PagePreview } from "../preview/PagePreview";

/**
 * Превью книги в редакторе. Вопросы оно берёт отложенными (useDeferredValue): символ в ответе сразу виден
 * в поле, а книга перерисовывается, когда браузер свободен, — и не на каждый символ. Второй, отложенный проход
 * затрагивает только превью, а не весь редактор. Фото — без отложения: они меняются не на каждый символ,
 * а уголок размера и перетаскивание считают от того, что видно сейчас.
 */
export function PreviewPane({ questions, photos, epigraphs, currentId, chapters, ...rest }: { questions: EditorQuestion[]; photos: EditorPhoto[]; epigraphs: Record<string, string>; chapters?: EditorChapter[] } & Omit<ComponentProps<typeof PagePreview>, "chapters">) {
  const deferredQuestions = useDeferredValue(questions);
  const untitled = useMessages().book.untitledChapter;
  const groups = useMemo(() => groupByChapter(deferredQuestions, chapters), [deferredQuestions, chapters]);
  const preview = useMemo(() => previewChapters(groups, photos, epigraphs, currentId, untitled), [groups, photos, epigraphs, currentId, untitled]);
  return <PagePreview chapters={preview} currentId={currentId} {...rest} />;
}
