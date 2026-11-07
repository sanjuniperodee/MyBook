"use client";

import { useMessages } from "@/i18n/client";

/** Скелетон раздела книги — повторяет раскладку обзора (книга, название, следующий вопрос, путь), чтобы переход не «прыгал». */
export default function Loading() {
  const t = useMessages().books.hub;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12" aria-busy="true" aria-label={t.loading}>
      <div className="grid items-center gap-8 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)] md:gap-12 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-16">
        <div className="skeleton mx-auto aspect-[148/210] w-full max-w-[150px] rounded-[3px] md:max-w-[260px] lg:max-w-[300px]" />
        <div className="space-y-4">
          <div className="skeleton h-12 w-3/4" />
          <div className="skeleton h-4 w-1/2" />
          <div className="skeleton h-1.5 max-w-xl" />
          <div className="skeleton h-44 max-w-xl rounded-[14px]" />
        </div>
      </div>
      <div className="skeleton mt-16 h-8 w-64" />
      <div className="skeleton mt-5 h-48 rounded-[14px]" />
    </main>
  );
}
