"use client";

/**
 * Вкладки и переключатели студии оформления (обложка, страницы): подчёркнутые вкладки панелей — слева и в шторке на
 * телефоне, и «шашка» на подложке для вида и стороны обложки. Здесь же — общий вид пустого состояния панели.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/class-names";

export interface StudioTab<T extends string> {
  id: T;
  label: ReactNode;
  icon?: LucideIcon;
  /** Счётчик справа от подписи. */
  count?: number;
  disabled?: boolean;
}

/** Вкладки панели: активная подчёркнута, лента листается, зона нажатия не ниже 44 px на сенсорных экранах. */
export function StudioTabs<T extends string>({ tabs, value, onChange, label, className }: { tabs: StudioTab<T>[]; value: T; onChange: (id: T) => void; label: string; className?: string }) {
  const uid = useId();
  const row = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  // Лента длиннее панели: край, за которым есть ещё вкладки, гаснет; выбранная вкладка всегда в поле зрения.
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const update = () => setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    el.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [value, tabs.length]);
  return (
    <div
      ref={row}
      role="tablist"
      aria-label={label}
      className={cn("no-scrollbar -mb-px flex gap-0.5 overflow-x-auto", className)}
      style={{ maskImage: `linear-gradient(90deg, ${edges.left ? "transparent" : "#000"} 0, #000 20px, #000 calc(100% - 20px), ${edges.right ? "transparent" : "#000"} 100%)` }}
    >
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            id={`${uid}-${t.id}`}
            type="button"
            role="tab"
            aria-selected={on}
            disabled={t.disabled}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-[13px] font-medium whitespace-nowrap transition-colors disabled:opacity-40 pointer-fine:min-h-10",
              on ? "border-wine text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t.icon ? <t.icon className={cn("size-4", on && "text-wine")} strokeWidth={1.8} aria-hidden /> : null}
            {t.label}
            {t.count ? <span className="count">{t.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export interface PillOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  title?: string;
  /** На телефоне — только значок (подпись для чтения с экрана). */
  iconOnly?: boolean;
}

/** Переключатель на подложке: выбранный вариант — белая шашка. */
export function PillSwitch<T extends string>({ options, value, onChange, label, size = "md", className }: { options: PillOption<T>[]; value: T; onChange: (v: T) => void; label: string; size?: "sm" | "md"; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex max-w-full shrink-0 gap-0.5 rounded-[calc(var(--r-ctl)+2px)] bg-sunken p-0.5", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.title}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[var(--r-ctl)] px-3 text-[13px] font-medium whitespace-nowrap transition-colors disabled:opacity-40",
              size === "sm" ? "h-8 pointer-coarse:h-10" : "h-9 pointer-coarse:h-11",
              on ? "bg-white text-ink shadow-[0_1px_2px_rgb(30_25_22/0.12)]" : "text-muted hover:text-ink",
            )}
          >
            {o.icon}
            {o.iconOnly ? <span className="max-sm:sr-only">{o.label}</span> : o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Подзаголовок группы внутри панели: без капса, строчными, с необязательным действием справа. */
export function GroupTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-2 flex min-h-6 items-center justify-between gap-2", className)}>
      <h3 className="text-[13px] font-semibold text-ink">{children}</h3>
      {action}
    </div>
  );
}
