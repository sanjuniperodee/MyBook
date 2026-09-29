"use client";

import { useState } from "react";
import { ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";

export function PreviewFrame({ bookId }: { bookId: string }) {
  const [version, setVersion] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const src = `/api/books/${bookId}/preview?v=${version}`;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Предпросмотр с водяным знаком и облегчёнными фото. В печать уйдут файлы в полном качестве.</p>
        <div className="flex gap-2">
          <button
            className="btn btn-outline btn-sm"
            onClick={() => {
              setLoading(true);
              setVersion(Date.now());
            }}
          >
            <RefreshCw className="size-4" /> Обновить
          </button>
          <a href={src} target="_blank" rel="noopener" className="btn btn-outline btn-sm">
            <ExternalLink className="size-4" /> Открыть PDF
          </a>
        </div>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-line bg-[#e9e4dc]">
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted">
            <LoaderCircle className="size-8 animate-spin" />
            Собираем макет книги…
          </div>
        ) : null}
        <iframe key={version} src={src} title="Предпросмотр книги" className="h-[80vh] w-full" onLoad={() => setLoading(false)} />
      </div>
    </div>
  );
}
