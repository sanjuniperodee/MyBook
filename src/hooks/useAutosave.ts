"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

/**
 * Откладывает сохранение изменений (debounce) и гарантирует, что последнее значение
 * будет сохранено: при уходе со страницы, при размонтировании и повторно после ошибки сети.
 */
export function useAutosave<T>(save: (value: T) => Promise<void>, delay = 900) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<{ value: T } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const saveRef = useRef(save);
  const flushRef = useRef<() => Promise<void>>(async () => {});

  useLayoutEffect(() => {
    saveRef.current = save;
  });

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (inflight.current) await inflight.current.catch(() => {});
    const item = pending.current;
    if (!item) return;
    pending.current = null;
    setStatus("saving");
    const p = saveRef
      .current(item.value)
      .then(() => {
        setError(null);
        setStatus(pending.current ? "dirty" : "saved");
      })
      .catch((e: Error) => {
        pending.current ??= item;
        setError(e.message);
        setStatus("error");
        // повторная попытка через несколько секунд
        if (!timer.current) timer.current = setTimeout(() => void flushRef.current(), 6000);
      });
    inflight.current = p;
    await p;
    inflight.current = null;
  }, []);

  useLayoutEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const schedule = useCallback(
    (value: T) => {
      pending.current = { value };
      setStatus("dirty");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [delay, flush],
  );

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (pending.current || inflight.current) {
        void flush();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      void flush();
    };
  }, [flush]);

  return { status, error, schedule, flush };
}
