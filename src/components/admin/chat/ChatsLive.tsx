"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Полная пересборка страницы — не чаще раза в минуту: она тянет список, сделку, шаблоны, счета (~250 КБ на телефоне). */
const FULL_REFRESH_MS = 60_000;
/** Вкладка была скрыта дольше — при возврате обновляем всё (бот мог взять диалог, сменился ответственный). */
const HIDDEN_MS = 60_000;

/**
 * Живое обновление страницы чатов. Ленту открытого диалога и список обновляют сами ChatPanel и ChatRows маленькими
 * JSON-запросами по событию SSE — здесь только редкая полная пересборка для того, что рисует сервер вокруг: шапка,
 * плашка бота, боковая колонка (сделка, ответственный, счета). По событию открытого диалога — не чаще раза в минуту;
 * при возврате во вкладку после долгого отсутствия — сразу.
 */
export function ChatsLive({ open }: { open: string | null }) {
  const router = useRouter();
  useEffect(() => {
    let last = Date.now();
    let hiddenAt = 0;
    let timer: number | undefined;
    const full = () => {
      last = Date.now();
      router.refresh();
    };
    const onLive = (e: Event) => {
      const d = (e as CustomEvent<{ type?: string; conversationId?: string | null }>).detail;
      if (d?.type !== "chat" || !open || (d.conversationId && d.conversationId !== open) || document.visibilityState !== "visible" || timer) return;
      timer = window.setTimeout(
        () => {
          timer = undefined;
          if (document.visibilityState === "visible") full();
        },
        Math.max(0, FULL_REFRESH_MS - (Date.now() - last)),
      );
    };
    const onVisible = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > HIDDEN_MS) full();
    };
    window.addEventListener("crm:live", onLive);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("crm:live", onLive);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, open]);
  return null;
}
