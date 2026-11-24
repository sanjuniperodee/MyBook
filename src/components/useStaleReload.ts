"use client";

import { useEffect, useState } from "react";
import { isStaleVersionError, reloadIfStale } from "@/lib/stale-version";

/**
 * Для страниц ошибок (error.tsx): ошибка от прошлой версии страницы — одна перезагрузка вместо страницы ошибки.
 * Возвращает true, пока страницу перезагружают (страницу ошибки не показывать); перезагрузка уже была недавно — false,
 * и человек видит обычную страницу ошибки (без петли перезагрузок).
 */
export function useStaleReload(error: unknown): boolean {
  const [pending, setPending] = useState(() => isStaleVersionError(error));
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- решение о перезагрузке — только в браузере (sessionStorage)
    if (isStaleVersionError(error)) setPending(reloadIfStale(error));
  }, [error]);
  return pending;
}
