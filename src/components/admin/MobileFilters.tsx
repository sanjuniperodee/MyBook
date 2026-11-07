"use client";

import { useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/class-names";

/**
 * Фильтры списка: на телефоне прячутся за кнопкой «Фильтры» (иначе они занимают пол-экрана раньше самих данных), на
 * больших экранах всегда на виду, как раньше. Если фильтр уже применён (active), кнопка подсвечена.
 * compact — на телефоне кнопка-значок в одной строке с поиском (обёртка — элемент строки), раскрытые поля — строкой ниже.
 */
export function MobileFilters({ children, active = false, label = "Фильтры", className, compact = false }: { children: React.ReactNode; active?: boolean; label?: string; className?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn(compact ? "contents" : "lg:contents", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={compact ? label : undefined}
        title={compact ? label : undefined}
        className={cn(
          "relative flex items-center rounded-[var(--r-ctl)] border text-sm font-medium transition-colors lg:hidden",
          compact ? "size-11 shrink-0 justify-center" : "min-h-11 w-full gap-2 px-3.5 py-2.5",
          active ? "border-wine/40 bg-rose text-wine" : "border-line-strong bg-white text-ink-soft",
          open && "border-ink/40",
        )}
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        {compact ? null : label}
        {active ? <span className={cn("size-1.5 rounded-full bg-wine", compact && "absolute top-2 right-2")} aria-label="фильтр применён" /> : null}
        {compact ? null : <ChevronDown className={cn("ml-auto size-4 transition", open && "rotate-180")} aria-hidden />}
      </button>
      <div
        className={cn(
          open ? "block [&_.btn]:w-full [&_form]:flex-col [&_form]:items-stretch [&_input:not([type=checkbox])]:w-full! [&_select]:w-full!" : "hidden",
          compact ? "max-lg:order-last max-lg:w-full" : "mt-2",
          "lg:contents lg:[&_form]:flex-row",
        )}
      >
        {children}
      </div>
    </div>
  );
}
