"use client";

import { ChevronDown } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/class-names";

/** Строка ленты книги: название и пометка, нажатие раскрывает правку ниже (раскрыта одна строка за раз — решает страница). */
export function RibbonItem({ title, meta, open, onToggle, children }: { title: ReactNode; meta?: ReactNode; open: boolean; onToggle: () => void; children: ReactNode }) {
  const id = useId();
  return (
    <li className={cn("rounded-[var(--r-panel)] bg-white ring-1 transition", open ? "ring-2 ring-wine/40" : "ring-line hover:ring-ink/30")}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle} className="flex min-h-11 w-full items-center gap-2 px-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{title}</span>
          {meta ? <span className="block truncate text-xs text-muted">{meta}</span> : null}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted transition", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div id={id} className="space-y-3 border-t border-line px-3 py-3">
          {children}
        </div>
      ) : null}
    </li>
  );
}
