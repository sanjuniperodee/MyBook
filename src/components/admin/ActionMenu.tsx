"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Ellipsis } from "lucide-react";
import { cn } from "@/lib/class-names";

const item = "flex min-h-10 w-full items-center gap-2.5 rounded-[var(--r-ctl)] px-3 text-left text-sm whitespace-nowrap text-ink-soft transition-colors hover:bg-sunken hover:text-ink max-lg:min-h-11 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted";

/**
 * «Ещё» в шапке страницы (DESIGN.md §7.2): одна главная кнопка на экране, редкие действия — настройки раздела, выгрузки,
 * удаление — в меню. Закрывается кликом мимо, Esc (фокус возвращается на кнопку) и выбором пункта.
 */
export function ActionMenu({ children, label = "Ещё", className }: { children: React.ReactNode; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div ref={root} className={cn("relative", className)}>
      <button ref={button} type="button" className="btn btn-outline btn-sm w-full" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Ellipsis className="size-4" aria-hidden /> {label}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1.5 min-w-60 rounded-[var(--r-sheet)] border border-line bg-white p-1.5 shadow-soft"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a,button")) setOpen(false);
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** Пункт-ссылка меню: значок (элемент lucide) и подпись. external — обычная ссылка (файл, API), не переход Next. */
export function MenuLink({ href, icon, children, title, external }: { href: string; icon?: React.ReactNode; children: React.ReactNode; title?: string; external?: boolean }) {
  return external ? (
    <a href={href} role="menuitem" className={item} title={title}>
      {icon}
      {children}
    </a>
  ) : (
    <Link href={href} role="menuitem" className={item} title={title}>
      {icon}
      {children}
    </Link>
  );
}

/** Разделитель групп пунктов. */
export function MenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-line" />;
}

export const menuItemClass = item;
