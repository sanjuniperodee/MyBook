"use client";

import { useEffect, useState } from "react";
import { Bot, UserRound } from "lucide-react";
import { cn } from "@/lib/class-names";
import { waitLabel } from "@/modules/reporting/ui/response-wait";
import { liveChannel } from "../liveRules";
import { ChatListLink } from "./ChatNav";
import { ChatAvatar } from "./ChatAvatar";
import type { ChatFilter, ChatListItem } from "./inbox-model";

/** Склейка событий: пачка сообщений и статусов — один запрос списка. На телефоне реже (сеть и процессор дороже). */
const GAP_MS = 800;
const GAP_MS_TOUCH = 1500;

/**
 * Строки списка «Чатов» с живым обновлением: событие о диалоге (SSE) — маленький JSON строк (/api/admin/chats/inbox), а не
 * пересборка всей страницы с открытой перепиской. Открытый диалог сразу без счётчика непрочитанных (сервер отметит сам).
 *
 * Строка как в мессенджере на телефоне: аватар, имя и время, последнее сообщение и счётчик; третья строка — только когда
 * нужно действие (ждёт ответа, ведёт бот, без ответственного). На телефоне — на всю ширину с тонкими разделителями.
 */
export function ChatRows({ initial, selectedId, filter, q }: { initial: ChatListItem[]; selectedId: string | null; filter: ChatFilter; q: string }) {
  const [items, setItems] = useState(initial);
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setItems(initial);
  }

  useEffect(() => {
    let timer: number | undefined;
    let stale = false;
    const gap = window.matchMedia("(pointer: coarse)").matches ? GAP_MS_TOUCH : GAP_MS;
    const load = async () => {
      try {
        const res = await fetch(`/api/admin/chats/inbox?f=${filter}${q ? `&q=${encodeURIComponent(q)}` : ""}`, { cache: "no-store" });
        if (res.ok) setItems(((await res.json()) as { items: ChatListItem[] }).items);
      } catch {
        // нет сети — следующее событие или опрос
      }
    };
    const schedule = (ms: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(), ms);
    };
    const onLive = (e: Event) => {
      if ((e as CustomEvent<{ type?: string }>).detail?.type !== "chat") return;
      if (document.visibilityState !== "visible") return void (stale = true);
      schedule(gap);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && stale) {
        stale = false;
        schedule(0);
      }
    };
    const poll = window.setInterval(() => document.visibilityState === "visible" && !liveChannel.connected() && void load(), 15_000);
    window.addEventListener("crm:live", onLive);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(poll);
      window.removeEventListener("crm:live", onLive);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [filter, q]);

  const href = (id: string) => `/admin/chats?f=${filter}${q ? `&q=${encodeURIComponent(q)}` : ""}&c=${id}`;
  return (
    <>
      {items.map((c) => {
        const active = c.id === selectedId;
        const unread = active ? 0 : c.unread;
        const needs = c.waitMinutes !== null || c.bot || !c.assignee;
        return (
          <ChatListLink key={c.id} id={c.id} href={href(c.id)} active={active} pinned={c.pinned}>
            <ChatAvatar name={c.title} url={c.avatarUrl} channel={c.channel} size={48} />
            <div className="min-w-0 flex-1 max-lg:border-b max-lg:border-line max-lg:py-3 max-lg:pr-4">
              <div className="flex items-baseline gap-2">
                <span className={cn("min-w-0 flex-1 truncate text-[16px] leading-5 text-ink lg:text-[15px]", unread ? "font-semibold" : "font-medium")}>{c.title}</span>
                <span className={cn("shrink-0 text-xs tabular-nums", unread ? "font-semibold text-wine" : "text-muted")}>{c.time}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className={cn("min-w-0 flex-1 truncate text-[14px] leading-5 lg:text-[13px]", unread ? "text-ink" : "text-muted")}>{c.preview || "Без текста"}</span>
                {unread ? (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-wine px-1.5 text-xs font-semibold text-white tabular-nums" aria-label={`Непрочитанных: ${unread}`}>
                    {unread > 99 ? "99+" : unread}
                  </span>
                ) : null}
              </div>
              <div className={cn("flex min-w-0 items-center gap-1.5", needs ? "mt-1.5" : "mt-1 max-lg:hidden")}>
                {c.waitMinutes !== null ? <span className={cn("badge", c.overdue ? "badge-danger" : "badge-warning")}>ждёт {c.waitLabel || waitLabel(c.waitMinutes)}</span> : null}
                {c.bot ? (
                  <span className="badge badge-info">
                    <Bot className="size-3" aria-hidden /> бот ведёт
                  </span>
                ) : null}
                {c.assignee ? (
                  <span className="flex min-w-0 items-center gap-1 text-xs text-muted max-lg:hidden">
                    <UserRound className="size-3 shrink-0" aria-hidden />
                    <span className="truncate">{c.assignee}</span>
                  </span>
                ) : (
                  <span className="badge">без ответственного</span>
                )}
              </div>
            </div>
          </ChatListLink>
        );
      })}
    </>
  );
}
