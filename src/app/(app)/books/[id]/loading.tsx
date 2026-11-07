"use client";

import { useMessages } from "@/i18n/client";

/** Скелетон раздела книги — повторяет раскладку обзора (книга слева, следующий шаг и путь справа), чтобы переход не «прыгал». */
export default function Loading() {
  const t = useMessages().books.hub;
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10" aria-busy="true" aria-label={t.loading}>
      <div className="grid gap-x-14 gap-y-6 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        <div className="flex items-center gap-4 lg:block">
          <div className="skeleton aspect-[148/210] w-[92px] shrink-0 rounded-[3px] lg:w-full lg:max-w-[280px]" />
          <div className="min-w-0 flex-1 space-y-3 lg:mt-9">
            <div className="skeleton h-9 w-3/4" />
            <div className="skeleton h-4 w-1/2" />
          </div>
        </div>
        <div className="min-w-0 space-y-7">
          <div className="skeleton h-44 rounded-[14px]" />
          <div className="skeleton h-24 rounded-[14px]" />
          <div className="space-y-px">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="skeleton h-[4.25rem] rounded-none first:rounded-t-[14px] last:rounded-b-[14px]" />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
