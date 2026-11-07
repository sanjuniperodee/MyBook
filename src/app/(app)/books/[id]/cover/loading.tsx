"use client";

import { useMessages } from "@/i18n/client";

/** Скелет студии: панель, левая колонка, сцена и правая колонка — на телефоне сцена сверху и вкладки под ней. */
export default function Loading() {
  const label = useMessages().books.hub.loading;
  return (
    <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6" aria-busy="true" aria-label={label}>
      <div className="mb-3 flex items-center gap-4">
        <div className="skeleton h-8 w-40 max-sm:hidden" />
        <div className="skeleton h-9 w-64 max-w-full" />
        <div className="skeleton ml-auto h-5 w-24" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)_320px] lg:gap-5">
        <div className="skeleton hidden h-[min(640px,70dvh)] rounded-[var(--r-panel)] lg:block" />
        <div className="skeleton h-[min(38dvh,20rem)] rounded-[var(--r-sheet)] lg:h-[min(640px,70dvh)]" />
        <div className="skeleton h-48 rounded-[var(--r-panel)] lg:h-[min(640px,70dvh)]" />
      </div>
    </main>
  );
}
