"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { TornPageArt } from "@/components/illustrations";
import { Link, useMessages } from "@/i18n/client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const m = useMessages().common;
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center px-4 py-16 text-center">
      <TornPageArt className="h-44 w-auto" />
      <h1 className="mt-4 font-serif text-4xl font-medium">{m.errorPage.title}</h1>
      <p className="mt-3 max-w-md text-muted">{m.errorPage.text}</p>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-muted">
          {m.errorPage.code} {error.digest}
        </p>
      ) : null}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button onClick={reset} className="btn btn-primary">
          <RotateCcw className="size-4" /> {m.actions.retry}
        </button>
        <Link href="/books" className="btn btn-outline">
          {m.actions.toMyBooksLong}
        </Link>
      </div>
    </main>
  );
}
