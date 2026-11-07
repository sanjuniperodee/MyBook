"use client";

import { useMessages } from "@/i18n/client";

/** Скелет списка заказов: тот же лист — обложка, название и сумма, линейка статуса под ними. */
export default function Loading() {
  const t = useMessages().orders.list;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12" aria-busy="true" aria-label={t.loading}>
      <div className="skeleton h-11 w-56 sm:h-12" />
      <div className="skeleton mt-3 h-4 w-72 max-w-full" />
      <div className="mt-8 space-y-4">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="panel flex gap-4 p-4 sm:gap-6 sm:p-5">
            <div className="skeleton aspect-[148/210] w-16 shrink-0 rounded-[3px] sm:w-24" />
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="skeleton h-6 w-3/5" />
                  <div className="skeleton h-3.5 w-2/5" />
                </div>
                <div className="skeleton h-6 w-20" />
              </div>
              <div className="skeleton mt-6 h-4 w-full" />
              <div className="skeleton mt-5 h-4 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
