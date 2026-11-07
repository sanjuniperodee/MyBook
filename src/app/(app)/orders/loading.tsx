"use client";

import { useMessages } from "@/i18n/client";

/** Скелетон списка заказов: та же строка — мини-обложка, название, сумма. */
export default function Loading() {
  const t = useMessages().orders.list;
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12" aria-busy="true" aria-label={t.loading}>
      <div className="skeleton h-12 w-56" />
      <div className="mt-8 divide-y divide-line rounded-[14px] border border-line bg-white">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 p-4 sm:px-5">
            <div className="skeleton aspect-[148/210] w-12 rounded-[2px]" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-5 w-1/2" />
              <div className="skeleton h-3.5 w-1/3" />
            </div>
            <div className="skeleton h-5 w-20" />
          </div>
        ))}
      </div>
    </main>
  );
}
