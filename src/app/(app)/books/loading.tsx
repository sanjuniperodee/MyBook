"use client";

import { useMessages } from "@/i18n/client";

/** Скелетон полки: та же сетка обложек, что и у списка книг. */
export default function Loading() {
  const t = useMessages().books.list;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12" aria-busy="true" aria-label={t.loading}>
      <div className="skeleton h-11 w-56" />
      <div className="skeleton mt-3 h-3.5 w-72 max-w-full" />
      <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 sm:mt-12 sm:grid-cols-3 sm:gap-x-8 lg:grid-cols-4 lg:gap-x-10">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i}>
            <div className="skeleton aspect-[148/210] rounded-[3px]" />
            <div className="skeleton mt-4 h-3 w-20" />
            <div className="skeleton mt-2 h-5 w-4/5" />
            <div className="skeleton mt-3 h-1 w-full" />
          </div>
        ))}
        <div className="aspect-[148/210] rounded-[4px] border border-dashed border-line-strong" />
      </div>
    </main>
  );
}
