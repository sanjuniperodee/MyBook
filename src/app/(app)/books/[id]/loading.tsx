"use client";

import { useMessages } from "@/i18n/client";

/** Скелетон раздела книги — повторяет раскладку обзора, чтобы переход не «прыгал». */
export default function Loading() {
  const t = useMessages().books.hub;
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12" aria-busy="true" aria-label={t.loading}>
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-16">
        <div className="skeleton mx-auto aspect-[148/210] w-full max-w-[260px] lg:max-w-[300px]" />
        <div className="space-y-5">
          <div className="skeleton h-3 w-28" />
          <div className="skeleton h-12 w-3/4" />
          <div className="grid max-w-xl grid-cols-4 gap-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="skeleton h-14" />
            ))}
          </div>
          <div className="skeleton h-2 max-w-xl" />
          <div className="skeleton h-28 max-w-xl rounded-3xl" />
        </div>
      </div>
    </main>
  );
}
