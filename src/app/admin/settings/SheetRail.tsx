"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/class-names";
import { TONE_TEXT, type SheetTone } from "./ui";

export interface RailItem {
  id: string;
  label: string;
}

const DOT: Record<SheetTone, string> = { ok: "bg-success", off: "bg-line-strong", warn: "bg-warning", bad: "bg-danger" };

/** Состояния листов читаем с самих листов (data-state): лист — единственный источник правды, навигация только показывает. */
function useSheetStates(ids: string[]): string {
  const key = ids.join(",");
  const subscribe = (cb: () => void) => {
    const root = document.getElementById("settings-stack");
    if (!root) return () => {};
    const mo = new MutationObserver(cb);
    mo.observe(root, { attributes: true, attributeFilter: ["data-state"], subtree: true });
    return () => mo.disconnect();
  };
  const snapshot = () => key.split(",").map((id) => document.getElementById(id)?.getAttribute("data-state") ?? "").join(",");
  return useSyncExternalStore(subscribe, snapshot, () => "");
}

/**
 * Якоря листов страницы настроек (шаблон «Настройки», DESIGN.md §7.2): на ноутбуке — липкий столбец слева, на телефоне —
 * лента под шапкой. У каждого якоря точка состояния («подключено», «выключено», «нужно внимание», «ошибка»); клик
 * раскрывает свёрнутый лист и прокручивает к нему.
 */
export function SheetRail({ items, label = "Разделы страницы" }: { items: readonly RailItem[]; label?: string }) {
  const states = useSheetStates(items.map((i) => i.id)).split(",");
  const [current, setCurrent] = useState<string | null>(null);

  // Подсветка листа, который сейчас в верхней трети экрана.
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setCurrent(top.target.id);
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);

  const go = (id: string) => document.getElementById(id)?.dispatchEvent(new Event("sheet:open"));
  const mark = (i: number) => {
    const s = states[i] as SheetTone | "";
    return s ? (
      <>
        <span className={cn("size-2 shrink-0 rounded-full", DOT[s])} aria-hidden />
        <span className="sr-only">: {TONE_TEXT[s]}</span>
      </>
    ) : (
      <span className="size-2 shrink-0 rounded-full border border-line-strong" aria-hidden />
    );
  };
  return (
    <nav aria-label={label} className="sticky top-[var(--topbar-h)] z-10 -mx-4 min-w-0 bg-canvas/90 px-4 backdrop-blur sm:-mx-6 sm:px-6 lg:top-[calc(var(--topbar-h)+1.5rem)] lg:mx-0 lg:max-h-[calc(100dvh-var(--topbar-h)-3rem)] lg:self-start lg:overflow-y-auto lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
      {/* Телефон и планшет: лента ссылок под шапкой. */}
      <ul className="no-scrollbar relative flex gap-2 overflow-x-auto py-2 lg:hidden">
        {items.map((it, i) => (
          <li key={it.id} className="shrink-0">
            <a href={`#${it.id}`} onClick={() => go(it.id)} className="chip">
              {mark(i)}
              {it.label}
            </a>
          </li>
        ))}
      </ul>
      {/* Ноутбук: столбец якорей слева. */}
      <ul className="hidden space-y-0.5 lg:block">
        {items.map((it, i) => (
          <li key={it.id}>
            <a
              href={`#${it.id}`}
              onClick={() => go(it.id)}
              aria-current={current === it.id ? "location" : undefined}
              className={cn("flex min-h-8 items-center gap-2.5 rounded-[var(--r-ctl)] px-2.5 py-1 text-[13px] transition-colors", current === it.id ? "bg-white font-medium text-ink shadow-[inset_0_0_0_1px_var(--color-line)]" : "text-ink-soft hover:bg-ink/[0.05] hover:text-ink")}
            >
              {mark(i)}
              <span className="min-w-0 flex-1">{it.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
