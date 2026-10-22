"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Smartphone, X } from "lucide-react";
import { cn } from "@/lib/class-names";

type Panel = "search" | "phone" | null;

/**
 * Шапка списка чатов: заголовок со счётчиком и две кнопки-иконки справа — поиск и «у кого телефон WhatsApp» (выбор менеджера).
 * Каждая раскрывает свою панель под шапкой (одна за раз), чтобы список начинался сразу под заголовком. Если поиск уже задан —
 * панель поиска открыта, а значок подсвечен.
 */
export function ChatListHeader({ count, filter, q, toolbar }: { count: number | null; filter: string; q: string; toolbar?: React.ReactNode }) {
  const [open, setOpen] = useState<Panel>(q ? "search" : null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open === "search") input.current?.focus({ preventScroll: true });
  }, [open]);
  const toggle = (p: Exclude<Panel, null>) => setOpen((cur) => (cur === p ? null : p));
  const btn = (p: Exclude<Panel, null>, label: string, active: boolean, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => toggle(p)}
      aria-label={label}
      aria-expanded={open === p}
      className={cn("relative flex size-11 items-center justify-center rounded-full transition active:scale-95 lg:size-9", open === p ? "bg-wine/10 text-wine" : "text-ink-soft hover:bg-[#f3efe9]")}
    >
      {icon}
      {active && open !== p ? <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-wine lg:top-1.5 lg:right-1.5" /> : null}
    </button>
  );
  return (
    <div className="px-4 pt-2 lg:pt-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Чаты</h1>
        {count ? <span className="rounded-full bg-[#f3efe9] px-2.5 py-0.5 text-xs font-medium text-ink-soft tabular-nums">{count >= 200 ? "200+" : count}</span> : null}
        <div className="ml-auto flex items-center gap-0.5">
          {btn("search", "Поиск по чатам", !!q, <Search className="size-5" />)}
          {toolbar ? btn("phone", "Чей телефон WhatsApp", false, <Smartphone className="size-5" />) : null}
        </div>
      </div>
      <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="-mx-1 overflow-hidden px-1">
          <div className={cn("pt-2 pb-1", open !== "search" && "hidden")}>
            <form action="/admin/chats" className="relative">
              <input type="hidden" name="f" value={filter} />
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
              <input
                ref={input}
                name="q"
                type="search"
                defaultValue={q}
                placeholder="Поиск по имени, номеру, тексту"
                className="h-11 w-full rounded-full bg-[#f3efe9] pr-10 pl-10 text-sm outline-none transition placeholder:text-muted focus:bg-white focus:ring-2 focus:ring-wine/20 lg:h-10 [&::-webkit-search-cancel-button]:hidden"
              />
              {q ? (
                <a href={`/admin/chats?f=${filter}`} aria-label="Сбросить поиск" className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:text-ink">
                  <X className="size-4" />
                </a>
              ) : null}
            </form>
          </div>
          {toolbar ? <div className={cn("pt-2 pb-1", open !== "phone" && "hidden")}>{toolbar}</div> : null}
        </div>
      </div>
    </div>
  );
}
