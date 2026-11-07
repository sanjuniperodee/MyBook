"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { Link, useMessages } from "@/i18n/client";

/**
 * Ошибка страницы кабинета: шапка и нижняя панель остаются, человек не теряет «где я». Что случилось и что сделать —
 * в двух строках, повторить или вернуться к книгам.
 */
export default function CabinetError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const m = useMessages().common;
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-16 text-center sm:py-24">
      <h1 className="font-serif text-4xl leading-tight font-medium text-balance sm:text-5xl">{m.errorPage.title}</h1>
      <p className="mt-4 max-w-md leading-relaxed text-ink-soft">{m.errorPage.text}</p>
      {error.digest ? (
        <p className="mt-3 font-mono text-xs text-muted">
          {m.errorPage.code} {error.digest}
        </p>
      ) : null}
      <div className="mt-8 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
        <button type="button" onClick={reset} className="btn btn-primary btn-lg">
          <RotateCcw className="size-4" aria-hidden /> {m.actions.retry}
        </button>
        <Link href="/books" className="btn btn-outline btn-lg">
          {m.actions.toMyBooksLong}
        </Link>
      </div>
    </main>
  );
}
