import { useEffect, useState } from "react";
import type { BuildProgress } from "@/lib/book/book-build";

/**
 * Ход экранной сборки книги, пока active: раз в секунду, отдельным лёгким запросом (/build-progress) — полный /build
 * опрашивается реже, потому что каждый ответ грузит книгу. Сборки нет — null.
 */
export function useBuildProgress(bookId: string, active: boolean): BuildProgress | null {
  const [progress, setProgress] = useState<BuildProgress | null>(null);
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/books/${bookId}/build-progress`, { cache: "no-store" });
        if (!res.ok || stopped) return;
        const body = (await res.json()) as { progress: BuildProgress | null };
        if (!stopped) setProgress(body.progress);
      } catch {
        // Сеть мигнула — следующий опрос через секунду.
      }
    };
    void poll();
    const timer = setInterval(poll, 1000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [bookId, active]);
  return active ? progress : null;
}
