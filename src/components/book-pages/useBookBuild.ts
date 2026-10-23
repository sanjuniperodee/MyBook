import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { BookBuildState } from "@/lib/book/book-build";
import { apiFetch } from "@/lib/client-api";
import { BuildPoller, type BuildPollerEnv, type BuildPollerView } from "./build-poller";

/** Опрос в браузере: запрос /build, часы, видимость вкладки и таймеры окна. */
const browserEnv = (bookId: string): BuildPollerEnv => ({
  fetch: (retry, signal) => apiFetch<BookBuildState>(`/api/books/${bookId}/build${retry ? "?retry=1" : ""}`, { cache: "no-store", signal }),
  now: () => Date.now(),
  visible: () => document.visibilityState === "visible",
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (id) => window.clearTimeout(id as number | undefined),
});

export interface BookBuildView extends BuildPollerView {
  /** Кнопка «Попробовать снова»: после сбоя сборки просит повтор, иначе просто спрашивает; прошлый запрос отменяется. */
  retry: () => Promise<void>;
  /** Картинка полосы не загрузилась: переспросить сборку (её могли заменить), не чаще раза в несколько секунд. */
  recover: () => void;
}

/**
 * Экранная сборка книги (BookBuildState): пока «собирается» — опрашивает /build всё реже, на «готово» и «ошибка» —
 * замолкает. Вернулись во вкладку — спрашивает заново: книгу могли поправить в редакторе, и прошлая сборка устарела.
 * Сам опрос — BuildPoller (без React, его проверяют тесты).
 */
export function useBookBuild(bookId: string): BookBuildView {
  const poller = useMemo(() => new BuildPoller(browserEnv(bookId)), [bookId]);
  const view = useSyncExternalStore(poller.subscribe, poller.snapshot, poller.snapshot);

  useEffect(() => {
    poller.start();
    const onReturn = () => poller.wake();
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
      poller.stop();
    };
  }, [poller]);

  return useMemo(() => ({ ...view, retry: () => poller.retry(), recover: () => poller.recover() }), [view, poller]);
}
