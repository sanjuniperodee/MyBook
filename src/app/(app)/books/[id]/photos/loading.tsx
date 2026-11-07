"use client";

import { useMessages } from "@/i18n/client";

/** Скелет вкладки «Фото» той же формы: шапка, итоги, фильтры, галерея и колонка правил справа. */
export default function Loading() {
  const t = useMessages().books.hub;
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8" aria-busy="true" aria-label={t.loading}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="skeleton h-9 w-56 sm:h-10" />
          <div className="skeleton h-4 w-full max-w-xl" />
        </div>
        <div className="skeleton h-11 w-40 max-lg:hidden" />
      </div>
      <div className="skeleton h-14 w-full max-w-xl" />
      <div className="mt-5 grid gap-x-8 gap-y-4 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <div className="flex gap-2">
            <div className="skeleton h-9 w-20" />
            <div className="skeleton h-9 w-28" />
            <div className="skeleton h-9 w-24" />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="space-y-2">
                <div className="skeleton aspect-square rounded-[10px]" />
                <div className="skeleton h-3 w-4/5" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3 max-lg:hidden">
          <div className="skeleton h-72 rounded-[var(--r-panel)]" />
          <div className="skeleton h-24 rounded-[var(--r-panel)]" />
        </div>
      </div>
    </main>
  );
}
