"use client";

import { useState } from "react";
import { ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";
import { useMessages } from "@/i18n/client";

export function PreviewFrame({ bookId, initialVersion }: { bookId: string; initialVersion: number }) {
  // Версия с сервера (время изменения книги) — одинакова при SSR и гидратации.
  const [version, setVersion] = useState(initialVersion);
  const [loading, setLoading] = useState(true);
  const t = useMessages().books.preview;
  const src = `/api/books/${bookId}/preview?v=${version}`;
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
