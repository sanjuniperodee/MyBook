"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Globe, LogOut } from "lucide-react";
import { logoutAction } from "@/app/(auth)/actions";
import { ShiftToggle } from "./ShiftToggle";
import { ThemeSwitch } from "./Theme";
import { cn } from "@/lib/class-names";

/**
 * Профиль внизу боковой панели: кто вошёл (в узком режиме — только аватар), меню — смена, тема, сайт и выход.
 * Закрывается по Esc, клику снаружи и после перехода.
 */
export function UserMenu({ adminName, roleName, onShift, canShift, wide = false }: { adminName: string; roleName: string; onShift: boolean; canShift: boolean; wide?: boolean | "xl" }) {
  // "xl" — строка с именем только от 1280 px (панель в режиме auto), уже — один аватар.
  const xl = wide === "xl";
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={root} className={cn("relative", wide && "w-full", xl && "max-xl:w-auto")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${adminName}, ${roleName}. Меню профиля`}
        className={cn("flex items-center rounded-lg text-left transition-colors", wide ? "w-full gap-2.5 p-1.5 hover:bg-sunken" : "p-1", xl && "max-xl:w-auto max-xl:p-1", open && "bg-sunken")}
      >
        <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-wine text-[13px] font-semibold text-white uppercase">
          {adminName.slice(0, 1) || "?"}
        </span>
        {wide ? (
          <span className={cn("min-w-0 flex-1", xl && "max-xl:hidden")}>
            <span className="block truncate text-[13px] font-semibold">{adminName}</span>
            <span className="block truncate text-xs text-muted">{roleName}</span>
          </span>
        ) : null}
      </button>
      {open ? (
        <div role="menu" className={cn("absolute z-50 w-72 rounded-[var(--r-sheet)] border border-line bg-white p-2 shadow-lift", wide ? cn("bottom-[calc(100%+0.5rem)] left-0", xl && "max-xl:bottom-0 max-xl:left-[calc(100%+0.75rem)]") : "bottom-0 left-[calc(100%+0.75rem)]")}>
          <div className="px-2 pt-1.5 pb-2.5">
            <div className="truncate text-sm font-semibold">{adminName}</div>
            <div className="truncate text-xs text-muted">{roleName}</div>
          </div>
          {canShift ? (
            <div className="border-t border-line py-1">
              <ShiftToggle initial={onShift} variant="menu" />
            </div>
          ) : null}
          <div className="border-t border-line px-1 py-2">
            <div className="mb-1.5 px-1 text-xs text-muted">Тема</div>
            <ThemeSwitch />
          </div>
          <div className="border-t border-line pt-1">
            <Link href="/books" onClick={() => setOpen(false)} role="menuitem" className="flex h-9 items-center gap-2.5 rounded-lg px-2 text-[13px] text-ink-soft hover:bg-sunken hover:text-ink">
              <Globe className="size-4" strokeWidth={1.8} aria-hidden /> На сайт
            </Link>
            <form action={logoutAction}>
              <button role="menuitem" className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[13px] text-ink-soft hover:bg-sunken hover:text-ink">
                <LogOut className="size-4" strokeWidth={1.8} aria-hidden /> Выйти из CRM
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
