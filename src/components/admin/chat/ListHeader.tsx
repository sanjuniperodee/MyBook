"use client";

import { useState } from "react";
import { Search, Smartphone, X } from "lucide-react";
import { cn } from "@/lib/class-names";

/**
 * Шапка списка чатов: заголовок со счётчиком, поиск всегда на виду (в «Входящих» им пользуются постоянно) и кнопка
 * «у кого телефон WhatsApp» — она раскрывает выбор менеджера под шапкой.
 */
export function ChatListHeader({ count, filter, q, toolbar }: { count: number | null; filter: string; q: string; toolbar?: React.ReactNode }) {
  const [phone, setPhone] = useState(false);
  return (
    <div className="shrink-0 px-4 pt-3 pb-2 lg:pt-4">
      <div className="flex min-h-11 items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Чаты</h1>
        {count ? <span className="badge tabular-nums">{count >= 200 ? "200+" : count}</span> : null}
        {toolbar ? (
          <button
            type="button"
            onClick={() => setPhone((v) => !v)}
            aria-label="Чей телефон WhatsApp"
            aria-expanded={phone}
            title="Кто отвечает с телефона магазина"
            className={cn("btn btn-ghost btn-icon btn-sm ml-auto max-lg:size-11", phone && "bg-sunken text-ink")}
          >
            <Smartphone className="size-[18px]" strokeWidth={1.8} />
          </button>
        ) : null}
      </div>
      {toolbar && phone ? <div className="pt-1.5 pb-1">{toolbar}</div> : null}
      <form action="/admin/chats" className="relative mt-2" role="search">
        <input type="hidden" name="f" value={filter} />
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Имя, номер или текст"
          aria-label="Поиск по чатам"
          className="input h-10 pr-10 pl-9 text-sm max-lg:h-11 [&::-webkit-search-cancel-button]:hidden"
        />
        {q ? (
          <a href={`/admin/chats?f=${filter}`} aria-label="Сбросить поиск" className="absolute top-1/2 right-0.5 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:text-ink max-lg:size-11">
            <X className="size-4" />
          </a>
        ) : null}
      </form>
    </div>
  );
}
