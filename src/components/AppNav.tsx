"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronDown, LayoutDashboard, LogOut, Package, UserRound } from "lucide-react";
import { logoutAction } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { Link, useLocalePathname, useMessages } from "@/i18n/client";

/** Навигация кабинета: активный раздел подсвечен, профиль и выход — в меню под именем. */
export function AppNav({ name, email, isAdmin }: { name: string; email: string; isAdmin: boolean }) {
  const pathname = useLocalePathname();
  const m = useMessages().common.nav;
  const links = [
    { href: "/books", label: m.myBooks, icon: BookOpen },
    { href: "/orders", label: m.orders, icon: Package },
  ];
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menu.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const initial = (name || email).trim().charAt(0).toUpperCase();
  return (
    <nav className="flex items-center gap-1 text-[15px]">
      <LanguageSwitch className="mr-1 hidden md:inline-flex" />
      {links.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn("flex items-center gap-2 rounded-full px-3 py-2 transition-colors sm:px-3.5", active ? "bg-ink/[.06] text-ink" : "text-ink-soft hover:bg-ink/5 hover:text-ink")}
          >
            <l.icon className="size-4 sm:hidden" strokeWidth={1.8} />
            <span className="hidden sm:inline">{l.label}</span>
          </Link>
        );
      })}
      <div ref={menu} className="relative ml-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="flex items-center gap-1.5 rounded-full border border-line bg-white py-1 pr-2.5 pl-1 transition hover:border-ink/30"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-wine text-xs font-semibold text-white">{initial}</span>
          <ChevronDown className={cn("size-4 text-muted transition-transform duration-200", open && "rotate-180")} />
          <span className="sr-only">{m.profileMenu}</span>
        </button>
        {open ? (
          <div role="menu" className="absolute right-0 mt-2 w-60 origin-top-right animate-[toast-in_180ms_var(--ease-out-soft)_both] rounded-2xl border border-line bg-white p-1.5 shadow-lift">
            <div className="px-3 py-2.5">
              <div className="truncate text-sm font-medium">{name || m.noName}</div>
              <div className="truncate text-xs text-muted">{email}</div>
            </div>
            <div className="my-1 h-px bg-line" />
            <div className="px-3 py-1.5 md:hidden">
              <LanguageSwitch />
            </div>
            <Link role="menuitem" href="/account" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm hover:bg-cream">
              <UserRound className="size-4 text-muted" /> {m.profile}
            </Link>
            {isAdmin ? (
              <Link role="menuitem" href="/admin" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-wine hover:bg-cream">
                <LayoutDashboard className="size-4" /> {m.crm}
              </Link>
            ) : null}
            <form action={logoutAction}>
              <button role="menuitem" className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm hover:bg-cream">
                <LogOut className="size-4 text-muted" /> {m.logout}
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
