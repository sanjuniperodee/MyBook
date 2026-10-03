"use client";

import { useMessages } from "@/i18n/client";

/**
 * Заглушка мастера новой книги. Без неё на время перехода показывалась заглушка списка книг —
 * чужая раскладка, которая мелькала сразу после регистрации. Повторяет форму: заголовок, поля, обложка.
 */
export default function Loading() {
  const t = useMessages().books.wizard;
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16" aria-busy="true" aria-label={t.loading}>
      <div className="grid gap-12 lg:grid-cols-[1fr_300px]">
        <div>
          <div className="skeleton h-4 w-24" />
          <div className="skeleton mt-6 h-11 w-60" />
          <div className="skeleton mt-4 h-4 w-full max-w-md" />
          <div className="mt-10 space-y-7">
            {[0, 1, 2, 3].map((i) => (
              <div key={i}>
                <div className="skeleton h-3.5 w-28" />
                <div className="skeleton mt-2.5 h-12 rounded-xl" />
              </div>
            ))}
          </div>
        </div>
        <div className="hidden lg:block">
          <div className="skeleton aspect-[148/210] w-full rounded-[3px]" />
        </div>
      </div>
    </main>
  );
}
