"use client";

import { useMessages } from "@/i18n/client";

/** Скелетон оформления: шапка, шаги мастера, лист шага и итог справа. */
export default function Loading() {
  const t = useMessages().checkout;
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8" aria-busy="true" aria-label={t.meta}>
      <div className="flex items-center gap-4">
        <div className="skeleton aspect-[148/210] w-12 rounded-[3px] sm:w-14" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-8 w-64 max-w-full" />
          <div className="skeleton h-4 w-80 max-w-full" />
        </div>
      </div>
      <div className="skeleton mt-5 h-16 rounded-[14px]" />
      <div className="mt-6 space-y-5">
        <div className="skeleton h-11 max-w-xl" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
          <div className="space-y-3">
            <div className="skeleton h-9 w-72" />
            <div className="skeleton h-28 rounded-[10px]" />
            <div className="skeleton h-28 rounded-[10px]" />
            <div className="skeleton h-28 rounded-[10px]" />
          </div>
          <div className="skeleton hidden h-80 rounded-[14px] lg:block" />
        </div>
      </div>
    </main>
  );
}
