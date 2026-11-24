"use client";

import { useEffect } from "react";
import { useMessages } from "@/i18n/client";
import { reloadIfStale, takeStaleReloadHint } from "@/lib/stale-version";
import { toast } from "@/components/ui/overlays";

/**
 * Страница от прошлой выкатки (lib/stale-version.ts): ошибку старого действия или пропавшего куска кода, которую никто не
 * поймал, — одной перезагрузкой; после неё — тихая подсказка «Обновили страницу до новой версии». Пойманные ошибки
 * перезагружают toastError и страницы ошибок (error.tsx) тем же reloadIfStale.
 */
export function StaleVersionGuard() {
  const m = useMessages().common;
  useEffect(() => {
    try {
      if (takeStaleReloadHint(window.sessionStorage, Date.now())) toast(m.staleReloaded, "info");
    } catch {
      // нет sessionStorage — и подсказки нет
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      if (reloadIfStale(e.reason)) e.preventDefault();
    };
    const onError = (e: ErrorEvent) => {
      if (reloadIfStale(e.error ?? e.message)) e.preventDefault();
    };
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, [m.staleReloaded]);
  return null;
}
