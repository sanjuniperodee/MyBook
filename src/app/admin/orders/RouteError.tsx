"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";

/**
 * Ошибка внутри раздела (заказы, производство, финансы, цены): меню и шапка CRM остаются на месте. Что случилось, что
 * сделать — «Повторить» запросит страницу заново, данные не потеряны; код (digest) — для разбора в логах руководителем.
 */
export function RouteError({ error, retry, title, back }: { error: Error & { digest?: string }; retry: () => void; title: string; back: { href: string; label: string } }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center" role="alert">
      <span className="flex size-11 items-center justify-center rounded-[var(--r-panel)] bg-danger-bg text-danger">
        <TriangleAlert className="size-5" aria-hidden />
      </span>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-sm text-muted">Сервер не ответил или пропала связь. Ничего не потеряно: нажмите «Повторить». Если снова не открывается, сообщите руководителю код ниже.</p>
      {error.digest ? <p className="font-mono text-xs text-muted">код {error.digest}</p> : null}
      <div className="mt-1 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => retry()} className="btn btn-dark btn-sm">
          <RotateCcw className="size-4" aria-hidden /> Повторить
        </button>
        <Link href={back.href} className="btn btn-outline btn-sm">
          {back.label}
        </Link>
      </div>
    </div>
  );
}
