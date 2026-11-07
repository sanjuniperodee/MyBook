"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { Link, useMessages } from "@/i18n/client";

/** Ошибка страницы: лист бумаги в тонкой рамке — что случилось и что сделать, без лишних картинок. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const m = useMessages().common;
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-[80dvh] items-center justify-center px-4 py-16">
      <div className="relative w-full max-w-xl px-6 py-14 text-center sm:px-12">
        <div aria-hidden className="pointer-events-none absolute inset-0 border border-line-strong" />
        <div aria-hidden className="pointer-events-none absolute inset-1.5 border border-line" />
        <h1 className="font-serif text-4xl leading-tight font-medium text-balance sm:text-5xl">{m.errorPage.title}</h1>
        <p className="mx-auto mt-4 max-w-md leading-relaxed text-ink-soft">{m.errorPage.text}</p>
        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-muted">
            {m.errorPage.code} {error.digest}
          </p>
        ) : null}
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button onClick={reset} className="btn btn-primary btn-lg">
            <RotateCcw className="size-4" aria-hidden /> {m.actions.retry}
          </button>
          <Link href="/books" className="btn btn-outline btn-lg">
            {m.actions.toMyBooksLong}
          </Link>
        </div>
      </div>
    </main>
  );
}
