"use client";

import { useMessages } from "@/i18n/client";

/** Скелет «Мои книги»: заголовок и главная книга — обложка слева, название, полоса прогресса и кнопка справа. */
export default function Loading() {
  const t = useMessages().books.list;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12" aria-busy="true" aria-label={t.loading}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="skeleton h-11 w-56 sm:h-12" />
          <div className="skeleton mt-3 h-3.5 w-64 max-w-full" />
        </div>
        <div className="skeleton h-11 w-36 shrink-0" />
      </div>
      <div className="mt-8 grid items-center gap-8 sm:mt-12 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)] md:gap-12 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:gap-16">
        <div className="skeleton mx-auto aspect-[148/210] w-full max-w-[170px] rounded-[3px] md:max-w-none" />
        <div>
          <div className="skeleton h-4 w-28" />
          <div className="skeleton mt-3 h-12 w-4/5" />
          <div className="skeleton mt-8 h-4 w-full max-w-xl" />
          <div className="skeleton mt-3 h-1.5 w-full max-w-xl" />
          <div className="skeleton mt-8 h-[52px] w-full max-w-60" />
        </div>
      </div>
    </main>
  );
}
