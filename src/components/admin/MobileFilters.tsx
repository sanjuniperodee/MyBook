"use client";

import { useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/class-names";

/**
 * Фильтры списка: на телефоне прячутся за кнопкой «Фильтры» (иначе они занимают пол-экрана раньше самих данных), на
 * больших экранах всегда на виду, как раньше. Если фильтр уже применён (active), кнопка подсвечена.
 */
export function MobileFilters({ children, active = false, label = "Фильтры", className }: { children: React.ReactNode; active?: boolean; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("lg:contents", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn("flex w-full items-center gap-2 rounded-xl border min-h-11 px-3.5 py-2.5 text-sm font-medium lg:hidden", active ? "border-wine/40 bg-wine/5 text-wine" : "border-line bg-white text-ink-soft")}
      >
        <SlidersHorizontal className="size-4" /> {label}
        {active ? <span className="size-1.5 rounded-full bg-wine" /> : null}
        <ChevronDown className={cn("ml-auto size-4 transition", open && "rotate-180")} />
      </button>
      <div className={cn(open ? "mt-2 block [&_form]:flex-col [&_form]:items-stretch [&_input:not([type=checkbox])]:w-full! [&_select]:w-full! [&_.btn]:w-full" : "hidden", "lg:contents lg:[&_form]:flex-row")}>{children}</div>
    </div>
  );
}
