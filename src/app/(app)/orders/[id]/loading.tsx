"use client";

import { useMessages } from "@/i18n/client";

/** Скелет заказа: шапка с номером, лист статуса с линейкой, детали и колонка книги справа. */
export default function Loading() {
  const t = useMessages().orders.list;
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10" aria-busy="true" aria-label={t.loading}>
      <div className="skeleton mt-2 h-5 w-28" />
      <div className="skeleton mt-5 h-11 w-64" />
      <div className="skeleton mt-3 h-4 w-44" />
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10">
        <div className="space-y-6">
          <div className="panel p-5 sm:p-7">
            <div className="skeleton h-9 w-3/5" />
            <div className="skeleton mt-3 h-4 w-4/5" />
            <div className="skeleton mt-8 h-6 w-full" />
          </div>
          <div className="panel p-5 sm:p-7">
            <div className="skeleton h-5 w-24" />
            <div className="mt-5 space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-4 w-full" />
              ))}
            </div>
          </div>
        </div>
        <div className="hidden lg:block">
          <div className="skeleton mx-auto aspect-[148/210] w-44 rounded-[3px]" />
        </div>
      </div>
    </main>
  );
}
