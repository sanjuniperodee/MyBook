"use client";

import { useMessages } from "@/i18n/client";

/** Скелет аккаунта: заголовок и группы настроек — название слева, лист справа. */
export default function Loading() {
  const t = useMessages().orders.account;
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12" aria-busy="true" aria-label={t.title}>
      <div className="skeleton h-11 w-48 sm:h-12" />
      <div className="skeleton mt-3 h-4 w-64 max-w-full" />
      <div className="mt-8 divide-y divide-line sm:mt-10">
        {[0, 1].map((i) => (
          <div key={i} className="grid gap-4 py-8 first:pt-0 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
            <div>
              <div className="skeleton h-5 w-28" />
              <div className="skeleton mt-2 h-3.5 w-48 max-w-full" />
            </div>
            <div className="panel space-y-4 p-5">
              <div className="skeleton h-11 w-full max-w-lg" />
              <div className="skeleton h-11 w-full max-w-lg" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
