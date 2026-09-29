"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center px-4 text-center">
      <h1 className="font-serif text-4xl">Что-то пошло не так</h1>
      <p className="mt-3 max-w-md text-muted">Мы уже знаем об ошибке. Ваши ответы сохранены — попробуйте обновить страницу.</p>
      {error.digest ? <p className="mt-2 text-xs text-muted">Код: {error.digest}</p> : null}
      <button onClick={reset} className="btn btn-primary mt-8">Попробовать снова</button>
    </main>
  );
}
