"use client";

import { useCallback, useRef, useState } from "react";
import type { PhotoEdit } from "@/lib/photo-edit/doc";

/** Шаги «Отменить» храним не бесконечно: описание правки маленькое, но рисунок от руки бывает длинным. */
const LIMIT = 100;
/** Правки с одним ключом подряд (ползунок, набор текста) за это время — один шаг отмены. */
const COALESCE_MS = 900;

/**
 * Правка фото с отменой и возвратом. set(next, key) — новый шаг; правки с тем же ключом подряд сливаются в один шаг.
 * Жест (перетаскивание, поворот, щипок) — begin() перед ним, set без шагов во время и end() после: один шаг на жест.
 */
export function useEditHistory(initial: PhotoEdit) {
  const h = useRef({
    doc: initial,
    past: [] as PhotoEdit[],
    future: [] as PhotoEdit[],
    key: "",
    at: 0,
    gesture: null as PhotoEdit | null,
  });
  // Снимок для отрисовки: ref — для обработчиков жестов (без ожидания перерисовки), состояние — для React.
  const [view, setView] = useState({
    doc: initial,
    canUndo: false,
    canRedo: false,
  });
  const render = useCallback(() => {
    const s = h.current;
    setView({
      doc: s.doc,
      canUndo: s.past.length > 0,
      canRedo: s.future.length > 0,
    });
  }, []);

  const set = useCallback(
    (next: PhotoEdit | ((d: PhotoEdit) => PhotoEdit), key = "") => {
      const s = h.current;
      const doc = typeof next === "function" ? next(s.doc) : next;
      if (doc === s.doc) return;
      const now = Date.now();
      if (!s.gesture && !(key && key === s.key && now - s.at < COALESCE_MS)) {
        s.past = [...s.past.slice(-LIMIT + 1), s.doc];
        s.future = [];
      }
      s.doc = doc;
      s.key = key;
      s.at = now;
      render();
    },
    [render],
  );

  const begin = useCallback(() => {
    h.current.gesture = h.current.doc;
    h.current.key = "";
  }, []);

  const end = useCallback(() => {
    const s = h.current;
    if (s.gesture && s.gesture !== s.doc) {
      s.past = [...s.past.slice(-LIMIT + 1), s.gesture];
      s.future = [];
    }
    s.gesture = null;
    render();
  }, [render]);

  const undo = useCallback(() => {
    const s = h.current;
    const prev = s.past.at(-1);
    if (!prev) return;
    s.past = s.past.slice(0, -1);
    s.future = [s.doc, ...s.future];
    s.doc = prev;
    s.key = "";
    render();
  }, [render]);

  const redo = useCallback(() => {
    const s = h.current;
    const next = s.future[0];
    if (!next) return;
    s.future = s.future.slice(1);
    s.past = [...s.past, s.doc];
    s.doc = next;
    s.key = "";
    render();
  }, [render]);

  /** Описание правки сейчас — для обработчиков, которые не ждут перерисовки (жесты). */
  const current = useCallback(() => h.current.doc, []);

  return { ...view, set, begin, end, undo, redo, current };
}
