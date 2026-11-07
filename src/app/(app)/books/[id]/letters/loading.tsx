"use client";

import { useMessages } from "@/i18n/client";

/** Скелетон писем: заголовок, вкладки, список писем и приглашение справа. */
export default function Loading() {
  const t = useMessages().books.letters;
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8" aria-busy="true" aria-label={t.meta}>
      <div className="mb-5 space-y-2">
        <div className="skeleton h-9 w-64" />
        <div className="skeleton h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
        <div className="space-y-4">
          <div className="skeleton h-10 w-72" />
          <div className="skeleton h-56 rounded-[14px]" />
        </div>
        <div className="skeleton h-72 rounded-[14px]" />
      </div>
    </main>
  );
}
