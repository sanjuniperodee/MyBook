"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { Search } from "lucide-react";
import { MobileFilters } from "@/components/admin/MobileFilters";
import { cn } from "@/lib/class-names";

export interface StageChip {
  key: string;
  label: string;
  href: string;
  active: boolean;
}

/**
 * Панель инструментов ведомости книг: поиск и тема — одной строкой (тема применяется сразу, поиск — по Enter), ниже —
 * чипы этапа книги. На телефоне поиск и кнопка фильтров в одной строке, чипы лентой.
 */
export function BooksToolbar({ stage, q, theme, themes, chips, narrowed, resetHref }: { stage: string; q: string; theme: string; themes: { id: string; name: string }[]; chips: StageChip[]; narrowed: boolean; resetHref: string }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  return (
    <div className="flex flex-col gap-3 lg:gap-0">
      <form
        ref={form}
        role="search"
        aria-label="Фильтры книг"
        className="flex flex-wrap items-center gap-2 lg:border-b lg:border-line lg:p-3"
        onSubmit={(e) => {
          e.preventDefault();
          const p = new URLSearchParams();
          for (const [k, v] of new FormData(e.currentTarget)) if (typeof v === "string" && v.trim() && !(k === "f" && v === "all")) p.set(k, v.trim());
          router.push(`/admin/books${p.size ? `?${p}` : ""}`);
        }}
        onChange={(e) => {
          if ((e.target as HTMLElement).matches("select")) form.current?.requestSubmit();
        }}
      >
        <input type="hidden" name="f" value={stage} />
        <div className="relative min-w-0 flex-1 lg:w-80 lg:max-w-sm lg:flex-none">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input name="q" type="search" defaultValue={q} placeholder="Название, имена, e-mail" aria-label="Поиск книг: название, имена, e-mail" className="input pl-9" />
        </div>
        <MobileFilters compact active={!!theme}>
          <select name="theme" defaultValue={theme} className="input lg:w-48" aria-label="Тема">
            <option value="">Все темы</option>
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </MobileFilters>
        {narrowed ? (
          <Link href={resetHref} className="btn btn-ghost btn-sm max-lg:hidden">
            Сбросить
          </Link>
        ) : null}
        <button type="submit" className="sr-only">
          Найти
        </button>
      </form>
      <nav aria-label="Этап книги" className="m-hscroll flex flex-wrap items-center gap-1.5 lg:border-b lg:border-line lg:px-3 lg:py-2.5">
        {chips.map((c) => (
          <Link key={c.key} href={c.href} aria-current={c.active ? "page" : undefined} className={cn("chip max-lg:h-10", c.active && "chip-on")}>
            {c.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
