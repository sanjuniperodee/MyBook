"use client";

import { useMessages } from "@/i18n/client";

/** Скелетон настроек: заголовок, якоря слева и листы справа. */
export default function Loading() {
  const t = useMessages().books.settings;
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8" aria-busy="true" aria-label={t.meta}>
      <div className="mb-6 space-y-2">
        <div className="skeleton h-9 w-64" />
        <div className="skeleton h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,640px)] lg:gap-12">
        <div className="skeleton hidden h-40 rounded-[14px] lg:block" />
        <div className="space-y-5">
          <div className="skeleton h-64 rounded-[14px]" />
          <div className="skeleton h-32 rounded-[14px]" />
          <div className="skeleton h-40 rounded-[14px]" />
        </div>
      </div>
    </main>
  );
}
