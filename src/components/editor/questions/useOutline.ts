"use client";

import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import { toast, toastError } from "@/components/ui/overlays";
import { useMessages } from "@/i18n/client";
import { apiFetch } from "@/lib/client-api";
import type { EditorQuestion } from "@/lib/book/editor-model";
import {
  applyOutline,
  chapterKeys,
  moveChapter,
  moveSection,
  moveSectionToChapter,
  MutationQueue,
  newSection,
  removeChapter,
  removeSection,
  restoreStructure,
  sectionsPayload,
  type OutlineState,
  type OutlineView,
} from "./outline";

/** Код ошибки API (ApiError.code) без привязки к классу — как isGone в draft.ts. */
const codeOf = (e: unknown) => (typeof e === "object" && e !== null ? (e as { code?: string }).code : undefined);

/** Операции оглавления своей книги; null в QuestionsEditor — оглавление не редактируется (нет права или не своя книга). */
export interface OutlineActions {
  addChapter(title: string, afterKey?: string): Promise<string | null>;
  moveChapter(key: string, delta: -1 | 1): void;
  deleteChapter(key: string): void;
  addSection(chapterKey: string, afterId?: string): Promise<string | null>;
  moveSection(id: string, delta: -1 | 1): void;
  moveSectionToChapter(id: string, chapterKey: string): void;
  deleteSection(id: string): void;
}

/**
 * Мутации оглавления своей книги. Идут по одной (MutationQueue) и оптимистично: сначала локальное состояние, затем
 * flush черновика, запрос и принятие актуального оглавления сервера как истины. При ошибке порядок откатывается;
 * 409 outlineOutdated и 404 (раздел или глава уже удалены) — тост и перечитывание страницы (onResync).
 */
export function useOutline({
  bookId,
  stateRef,
  setState,
  flush,
  forget,
  detachPhotos,
  onResync,
}: {
  bookId: string;
  stateRef: RefObject<OutlineState>;
  setState: (next: OutlineState | ((s: OutlineState) => OutlineState)) => void;
  flush: () => Promise<void>;
  forget: (ids?: Iterable<string>, chapterKey?: string) => void;
  /** Фото удалённых разделов отвязываются от них (на сервере то же делает FK). */
  detachPhotos: (questionIds: ReadonlySet<string>) => void;
  onResync: () => void;
}) {
  const t = useMessages().editor.nav;
  const queue = useRef(new MutationQueue());
  const [busy, setBusy] = useState(false);

  const apply = useCallback(
    (outline: OutlineView, fresh: EditorQuestion[] = []) => {
      const r = applyOutline(stateRef.current, outline, fresh);
      setState(r.state);
      if (r.unknown) onResync();
    },
    [stateRef, setState, onResync],
  );

  /** Одна операция: optimistic — локальное изменение сразу, job — запрос и принятие ответа. Возвращает результат job или null. */
  const mutate = useCallback(
    <R>(optimistic: ((s: OutlineState) => OutlineState) | null, job: (after: OutlineState) => Promise<R>): Promise<R | null> => {
      setBusy(true);
      return queue.current
        .run(async () => {
          const before = stateRef.current;
          const after = optimistic ? optimistic(before) : before;
          if (optimistic) setState(after);
          try {
            await flush();
            return await job(after);
          } catch (e) {
            if (optimistic) setState((cur) => restoreStructure(cur, before));
            const code = codeOf(e);
            if (code === "outlineOutdated") {
              toast(t.outdated, "info");
              onResync();
            } else if (code === "questionNotFound" || code === "chapterNotFound") {
              toast(t.gone, "info");
              onResync();
            } else toastError(e);
            return null;
          }
        })
        .finally(() => setBusy(queue.current.size > 0));
    },
    [stateRef, setState, flush, onResync, t],
  );

  const actions = useMemo<OutlineActions>(
    () => ({
      async addChapter(title, afterKey) {
        const res = await mutate(null, async () => {
          const r = await apiFetch<{ key: string; sectionId: string; outline: OutlineView }>(`/api/books/${bookId}/chapters`, { method: "POST", json: { title, afterKey } });
          apply(r.outline, [newSection({ id: r.sectionId, chapter: r.key }, r.outline.chapters.find((c) => c.key === r.key)?.title ?? title)]);
          return r;
        });
        return res?.sectionId ?? null;
      },
      moveChapter(key, delta) {
        void mutate(
          (s) => moveChapter(s, key, delta),
          async (after) => apply((await apiFetch<{ outline: OutlineView }>(`/api/books/${bookId}/chapters/order`, { method: "PUT", json: { keys: chapterKeys(after) } })).outline),
        );
      },
      deleteChapter(key) {
        const ids = new Set(stateRef.current.questions.filter((q) => q.chapter === key).map((q) => q.id));
        void mutate(
          (s) => removeChapter(s, key),
          async () => {
            const r = await apiFetch<{ outline: OutlineView }>(`/api/books/${bookId}/chapters/${key}`, { method: "DELETE" });
            forget(ids, key);
            detachPhotos(ids);
            apply(r.outline);
          },
        );
      },
      async addSection(chapterKey, afterId) {
        const res = await mutate(null, async () => {
          const r = await apiFetch<{ question?: { id: string; chapter: string; prompt?: string; title?: string }; outline: OutlineView }>(`/api/books/${bookId}/questions`, {
            method: "POST",
            json: { chapterKey, afterId, title: "", prompt: "" },
          });
          const row = r.question;
          apply(r.outline, row ? [newSection(row, r.outline.chapters.find((c) => c.key === chapterKey)?.title ?? "")] : []);
          if (!row) onResync();
          return row?.id ?? null;
        });
        return res;
      },
      moveSection(id, delta) {
        void mutate(
          (s) => moveSection(s, id, delta),
          async (after) => apply((await apiFetch<{ outline: OutlineView }>(`/api/books/${bookId}/questions/order`, { method: "PUT", json: { sections: sectionsPayload(after) } })).outline),
        );
      },
      moveSectionToChapter(id, chapterKey) {
        void mutate(
          (s) => moveSectionToChapter(s, id, chapterKey),
          async (after) => apply((await apiFetch<{ outline: OutlineView }>(`/api/books/${bookId}/questions/order`, { method: "PUT", json: { sections: sectionsPayload(after) } })).outline),
        );
      },
      deleteSection(id) {
        void mutate(
          (s) => removeSection(s, id),
          async () => {
            const r = await apiFetch<{ outline: OutlineView | null }>(`/api/books/${bookId}/questions/${id}`, { method: "DELETE" });
            forget([id]);
            detachPhotos(new Set([id]));
            if (r.outline) apply(r.outline);
          },
        );
      },
    }),
    [bookId, mutate, apply, stateRef, forget, detachPhotos, onResync],
  );

  return { actions, busy };
}
