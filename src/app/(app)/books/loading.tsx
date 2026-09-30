"use client";

import { useMessages } from "@/i18n/client";

export default function Loading() {
  const t = useMessages().books.list;
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14" aria-busy="true" aria-label={t.loading}>
      <div className="skeleton h-12 w-64" />
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="card flex gap-5 p-5">
            <div className="skeleton aspect-[148/210] w-28 shrink-0 rounded-[3px]" />
            <div className="flex-1 space-y-3 pt-1">
              <div className="skeleton h-3 w-20" />
              <div className="skeleton h-6 w-4/5" />
              <div className="skeleton h-3 w-1/2" />
              <div className="skeleton mt-8 h-1.5" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
