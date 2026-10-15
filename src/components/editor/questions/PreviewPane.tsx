"use client";

import { useDeferredValue, useMemo, type ComponentProps } from "react";
import { groupByChapter, previewChapters, type EditorPhoto, type EditorQuestion } from "@/lib/book/editor-model";
import { PagePreview } from "../preview/PagePreview";

/**
 * Превью книги в редакторе. Вопросы оно берёт отложенными (useDeferredValue): символ в ответе сразу виден
 * в поле, а книга перерисовывается, когда браузер свободен, — и не на каждый символ. Второй, отложенный проход
 * затрагивает только превью, а не весь редактор. Фото — без отложения: они меняются не на каждый символ,
 * а уголок размера и перетаскивание считают от того, что видно сейчас.
 */
export function PreviewPane({ questions, photos, epigraphs, currentId, ...rest }: { questions: EditorQuestion[]; photos: EditorPhoto[]; epigraphs: Record<string, string> } & Omit<ComponentProps<typeof PagePreview>, "chapters">) {
  const deferredQuestions = useDeferredValue(questions);
  const groups = useMemo(() => groupByChapter(deferredQuestions), [deferredQuestions]);
  const chapters = useMemo(() => previewChapters(groups, photos, epigraphs, currentId), [groups, photos, epigraphs, currentId]);
  return <PagePreview chapters={chapters} currentId={currentId} {...rest} />;
}
