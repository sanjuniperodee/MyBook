"use client";

import { useState, useSyncExternalStore } from "react";
import { ExternalLink, FileText, LoaderCircle, RefreshCw } from "lucide-react";
import { useMessages } from "@/i18n/client";

/** Телефон: iOS Safari показывает PDF в рамке только первой страницей и не листает — там открываем файл целиком. */
const subscribeNarrow = (cb: () => void) => {
  const mq = window.matchMedia("(max-width: 767px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

export function PreviewFrame({ bookId, initialVersion }: { bookId: string; initialVersion: number }) {
  const narrow = useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false,
  );
  // Версия с сервера (время изменения книги) — одинакова при SSR и гидратации.
  const [version, setVersion] = useState(initialVersion);
  const [loading, setLoading] = useState(true);
  const t = useMessages().books.preview;
  const src = `/api/books/${bookId}/preview?v=${version}`;
  if (narrow)
    return (
      <div className="rounded-3xl border border-line bg-white p-5 text-center shadow-soft">
        <FileText className="mx-auto size-10 text-wine" strokeWidth={1.5} />
        <p className="mt-3 text-sm text-muted">{t.note}</p>
        <a href={src} target="_blank" rel="noopener" className="btn btn-primary btn-lg mt-5 w-full">
          <ExternalLink className="size-5" /> {t.openPdf}
        </a>
      </div>
    );
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{t.note}</p>
        <div className="flex gap-2">
          <button
            className="btn btn-outline btn-sm"
            onClick={() => {
              setLoading(true);
              setVersion(Date.now());
            }}
          >
            <RefreshCw className="size-4" /> {t.refresh}
          </button>
          <a href={src} target="_blank" rel="noopener" className="btn btn-outline btn-sm">
            <ExternalLink className="size-4" /> {t.openPdf}
          </a>
        </div>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-line bg-[#e9e4dc]">
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted">
            <LoaderCircle className="size-8 animate-spin" />
            {t.building}
          </div>
        ) : null}
        <iframe key={version} src={src} title={t.frame} className="h-[80vh] w-full" onLoad={() => setLoading(false)} />
      </div>
    </div>
  );
}
