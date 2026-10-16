"use client";

import { useCallback, useRef, useState } from "react";
import { useAutosave } from "@/hooks/useAutosave";
import { apiFetch } from "@/lib/client-api";
import type { EditorQuestion } from "@/lib/book/editor-model";
import { appendPhrase, DraftQueue, sendDraft, type Patch } from "./draft";

/**
 * Вопросы книги в редакторе и их черновик: правки сразу видны, а на сервер уходят пачкой через 800 мс
 * после последней (useAutosave: при уходе со страницы, при размонтировании и повторно после ошибки сети).
 */
export function useQuestionsDraft({ bookId, editable, initialQuestions }: { bookId: string; editable: boolean; initialQuestions: EditorQuestion[] }) {
  const [questions, setQuestions] = useState(initialQuestions);
  const dirty = useRef(new DraftQueue());

  const { status, error, schedule, flush } = useAutosave<null>(
    () => sendDraft(dirty.current, (id, patch) => apiFetch(`/api/books/${bookId}/questions/${id}`, { method: "PATCH", json: patch })),
    800,
  );

  const patchQuestion = useCallback(
    (id: string, patch: Patch) => {
      if (!editable) return;
      setQuestions((qs) => qs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
      dirty.current.set(id, patch);
      schedule(null);
    },
    [editable, schedule],
  );

  /** Дописывает текст к актуальному значению ответа (без устаревших замыканий). */
  const appendText = useCallback(
    (id: string, text: string) => {
      if (!editable || !text) return;
      setQuestions((qs) =>
        qs.map((x) => {
          if (x.id !== id) return x;
          const answer = appendPhrase(x.answer, text);
          dirty.current.set(id, { answer });
          return { ...x, answer };
        }),
      );
      schedule(null);
    },
    [editable, schedule],
  );

  /** Свой вопрос сразу после вопроса after, в той же главе. Возвращает его место в списке. */
  const addQuestion = async (after: EditorQuestion, prompt: string) => {
    const res = await apiFetch<{ question: { id: string } }>(`/api/books/${bookId}/questions`, { method: "POST", json: { afterId: after.id, prompt } });
    const created: EditorQuestion = {
      id: res.question.id,
      chapter: after.chapter,
      chapterTitle: after.chapterTitle,
      prompt,
      hint: null,
      defaultTitle: prompt,
      displayText: null,
      hideHeading: false,
      answer: "",
      isCustom: true,
    };
    const at = questions.findIndex((x) => x.id === after.id) + 1;
    setQuestions((qs) => [...qs.slice(0, at), created, ...qs.slice(at)]);
    return at;
  };

  /** Удалить свой вопрос: сначала дописать черновик, затем удалить на сервере и забыть его правки. */
  const removeQuestion = async (id: string) => {
    await flush();
    await apiFetch(`/api/books/${bookId}/questions/${id}`, { method: "DELETE" });
    dirty.current.delete(id);
    setQuestions((qs) => qs.filter((x) => x.id !== id));
  };

  return { questions, status, error, flush, patchQuestion, appendText, addQuestion, removeQuestion };
}
