"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/class-names";

/**
 * Лист настройки со сворачиванием (DESIGN.md §6 — `.panel`). Закрытый показывает заголовок, состояние («подключён»,
 * «выключен») и одну строку пояснения, поэтому страницу с пятью формами видно целиком, а нужную раскрывают кликом.
 * Содержимое остаётся в разметке — набранное в свёрнутой форме не теряется. Ссылка с #id раскрывает и показывает лист.
 */
export function Section({
  title,
  badge,
  children,
  id,
  defaultOpen = true,
  description,
}: {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
  defaultOpen?: boolean;
  /** Одна строка под заголовком: что настраивает лист. */
  description?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (id && window.location.hash === `#${id}`) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- хэш адреса известен только в браузере: раскрываем один раз при открытии страницы
      setOpen(true);
      ref.current?.scrollIntoView({ block: "start" });
    }
  }, [id]);
  const body = useId();
  return (
    <section id={id} ref={ref} className="panel scroll-mt-[calc(var(--topbar-h)+1rem)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={body}
        className={cn("group flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-sunken/50 sm:px-5", open ? "rounded-t-[14px]" : "rounded-[14px]")}
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h2 className="panel-title">{title}</h2>
            {badge}
          </span>
          {description ? <span className="mt-0.5 block truncate text-xs text-muted">{description}</span> : null}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform group-hover:text-ink", open && "rotate-180")} strokeWidth={1.8} aria-hidden />
      </button>
      <div id={body} hidden={!open} className="border-t border-line px-4 pt-4 pb-5 sm:px-5">
        {children}
      </div>
    </section>
  );
}
