"use client";

import { useMessages } from "@/i18n/client";

/** Скелетон макета: заголовок, переключатель вида и лист читалки. */
export default function Loading() {
  const t = useMessages().books.preview;
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8" aria-busy="true" aria-label={t.meta}>
      <div className="mb-5 space-y-2">
        <div className="skeleton h-9 w-56" />
        <div className="skeleton h-4 w-96 max-w-full" />
      </div>
      <div className="skeleton mb-4 h-11 w-60 rounded-[12px]" />
      <div className="skeleton mx-auto aspect-[5/4] w-full max-w-4xl rounded-[14px]" />
    </main>
  );
}
