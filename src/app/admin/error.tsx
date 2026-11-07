"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";

/**
 * Ошибка страницы внутри CRM: меню, шапка и нижняя панель остаются на месте (граница ошибки — под layout админки), так что в
 * установленном на iPhone приложении это не тупик. «Повторить» (retry) заново запрашивает и рисует страницу, код — для разбора в логах.
 */
export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center" role="alert">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-red-50 text-red-700">
        <TriangleAlert className="size-6" aria-hidden />
      </span>
      <h1 className="text-lg font-semibold">Страница не открылась</h1>
      <p className="max-w-sm text-sm text-muted">Что-то пошло не так на сервере или пропала связь. Данные не потеряны — попробуйте ещё раз. Если повторяется, сообщите руководителю код ниже.</p>
      {error.digest ? <p className="font-mono text-xs text-muted">код {error.digest}</p> : null}
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => retry()} className="btn btn-dark btn-sm">
          <RotateCcw className="size-4" aria-hidden /> Повторить
        </button>
        <Link href="/admin" className="btn btn-outline btn-sm">
          На главную CRM
        </Link>
      </div>
    </div>
  );
}
