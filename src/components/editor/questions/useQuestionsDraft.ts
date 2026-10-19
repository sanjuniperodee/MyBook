"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useAutosave } from "@/hooks/useAutosave";
import { apiFetch } from "@/lib/client-api";
import type { EditorChapter, EditorQuestion } from "@/lib/book/editor-model";
import { appendPhrase, DraftQueue, localPatch, sendDraft, type ChapterPatch, type Patch } from "./draft";
import type { OutlineState } from "./outline";

/**
 * Вопросы и главы книги в редакторе и их черновик: правки сразу видны, а на сервер уходят пачкой через 800 мс
 * после последней (useAutosave: при уходе со страницы, при размонтировании и повторно после ошибки сети).
 * Правки глав своей книги (название, эпиграф) лежат во второй очереди того же автосохранения, поэтому flush(),
 * уход со страницы и размонтирование отправляют обе. Если раздела или главы уже нет на сервере, правка выбрасывается,
 * остальные уходят, а onGone вызывается один раз за отправку.
 */
export function useQuestionsDraft({
  bookId,
  editable,
  initialQuestions,
  initialChapters = [],
  onGone,
}: {
  bookId: string;
  editable: boolean;
  initialQuestions: EditorQuestion[];
  initialChapters?: EditorChapter[];
  onGone?: () => void;
}) {
  const [state, setRendered] = useState<OutlineState>({ questions: initialQuestions, chapters: initialChapters });
  // Источник истины для операций — ref, обновляемый сразу: цепочка мутаций оглавления не должна ждать перерисовки.
  const stateRef = useRef(state);
  const setState = useCallback((next: OutlineState | ((s: OutlineState) => OutlineState)) => {
    stateRef.current = typeof next === "function" ? next(stateRef.current) : next;
    setRendered(stateRef.current);
  }, []);
  const dirty = useRef(new DraftQueue());
  const dirtyChapters = useRef(new DraftQueue<ChapterPatch>());
  const goneRef = useRef(onGone);
  useLayoutEffect(() => {
    goneRef.current = onGone;
  });

  const { status, error, schedule, flush } = useAutosave<null>(async () => {
    const gone: string[] = [];
    let failure: unknown;
    try {
      await sendDraft(dirtyChapters.current, (key, patch) => apiFetch(`/api/books/${bookId}/chapters/${key}`, { method: "PATCH", json: patch }), gone);
    } catch (e) {
      failure = e;
    }
    try {
      await sendDraft(dirty.current, (id, patch) => apiFetch(`/api/books/${bookId}/questions/${id}`, { method: "PATCH", json: patch }), gone);
    } catch (e) {
      failure ??= e;
    }
    if (gone.length) goneRef.current?.();
    if (failure) throw failure;
  }, 800);

  const { questions, chapters } = state;

  const patchQuestion = useCallback(
    (id: string, patch: Patch) => {
      if (!editable) return;
      const local = localPatch(patch);
      setState((s) => ({ ...s, questions: s.questions.map((x) => (x.id === id ? { ...x, ...local } : x)) }));
      dirty.current.set(id, patch);
      schedule(null);
    },
    [editable, schedule, setState],
  );

  /** Название или эпиграф главы своей книги: сразу в оглавлении и превью, на сервер — отложенно. */
  const patchChapter = useCallback(
    (key: string, patch: ChapterPatch) => {
      if (!editable) return;
      setState((s) => {
        const chapters = s.chapters.map((c) => (c.key === key ? { ...c, ...patch } : c));
        const title = patch.title;
        return { chapters, questions: title === undefined ? s.questions : s.questions.map((q) => (q.chapter === key ? { ...q, chapterTitle: title } : q)) };
      });
      dirtyChapters.current.set(key, patch);
      schedule(null);
    },
    [editable, schedule, setState],
  );

  /** Дописывает текст к актуальному значению ответа (без устаревших замыканий). */
  const appendText = useCallback(
    (id: string, text: string) => {
      if (!editable || !text) return;
      setState((s) => ({
        ...s,
        questions: s.questions.map((x) => {
          if (x.id !== id) return x;
          const answer = appendPhrase(x.answer, text);
          dirty.current.set(id, { answer });
          return { ...x, answer };
        }),
      }));
      schedule(null);
    },
    [editable, schedule, setState],
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
      media: [],
      isCustom: true,
    };
    const at = questions.findIndex((x) => x.id === after.id) + 1;
    setState((s) => ({ ...s, questions: [...s.questions.slice(0, at), created, ...s.questions.slice(at)] }));
    return created.id;
  };

  /** Удалить свой вопрос книги с банком: сначала дописать черновик, затем удалить на сервере и забыть его правки. */
  const removeQuestion = async (id: string) => {
    await flush();
    await apiFetch(`/api/books/${bookId}/questions/${id}`, { method: "DELETE" });
    dirty.current.delete(id);
    setState((s) => ({ ...s, questions: s.questions.filter((x) => x.id !== id) }));
  };

  /** Забыть несохранённые правки удалённых разделов и главы. */
  const forget = useCallback((ids: Iterable<string> = [], chapterKey?: string) => {
    for (const id of ids) dirty.current.delete(id);
    if (chapterKey) dirtyChapters.current.delete(chapterKey);
  }, []);

  return { questions, chapters, state, stateRef, setState, status, error, flush, patchQuestion, patchChapter, appendText, addQuestion, removeQuestion, forget };
}
