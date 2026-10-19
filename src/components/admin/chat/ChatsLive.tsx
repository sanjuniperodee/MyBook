"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { coalesce, liveChannel } from "../liveRules";

/** Пока живой канал (SSE) открыт, опрос — только страховка; без него — как раньше, раз в 15 секунд. */
const POLL_MS = 15_000;
const POLL_MS_LIVE = 60_000;
/** Сообщение, статусы доставки и действия бота подряд — одно обновление в секунду, последнее не теряется. */
const GAP_MS = 1_000;

/**
 * Страница чатов обновляется сама по событию о любом диалоге: новый чат и счётчик в списке появляются сразу, даже
 * когда диалог не открыт, открытая переписка — тоже. Список и переписка рисуются на сервере, поэтому обновление —
 * router.refresh(), склеенное по времени.
 */
export function ChatsLive() {
  const router = useRouter();
  useEffect(() => {
    const refresh = coalesce(() => router.refresh(), GAP_MS);
    const onLive = (e: Event) => {
      const d = (e as CustomEvent<{ type?: string }>).detail;
      if (d?.type === "chat") void refresh();
    };
    let lastPoll = Date.now();
    const poll = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastPoll < (liveChannel.connected() ? POLL_MS_LIVE : POLL_MS)) return;
      lastPoll = Date.now();
      void refresh();
    };
    window.addEventListener("crm:live", onLive);
    const id = window.setInterval(poll, 5_000);
    return () => {
      window.removeEventListener("crm:live", onLive);
      window.clearInterval(id);
    };
  }, [router]);
  return null;
}
