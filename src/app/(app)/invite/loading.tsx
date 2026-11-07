"use client";

import { useMessages } from "@/i18n/client";

/** Скелет приглашений: заголовок, лист со ссылкой и колонка итогов справа. */
export default function Loading() {
  const t = useMessages().invite;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12" aria-busy="true" aria-label={t.meta}>
      <div className="skeleton h-11 w-3/4 max-w-xl sm:h-12" />
      <div className="skeleton mt-3 h-4 w-full max-w-2xl" />
      <div className="mt-8 grid gap-6 sm:mt-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
        <div className="panel space-y-4 p-5">
          <div className="skeleton h-11 w-full" />
          <div className="skeleton h-11 w-48" />
        </div>
        <div className="panel p-5 lg:row-span-2">
          <div className="skeleton h-12 w-16" />
          <div className="skeleton mt-3 h-4 w-full" />
        </div>
      </div>
    </main>
  );
}
