"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BookOpen, CheckSquare, Kanban, KeyRound, LayoutDashboard, Menu, Package, Tag, Users, X, Gift } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin", label: "Обзор", icon: LayoutDashboard, exact: true },
  { href: "/admin/board", label: "Производство", icon: Kanban, badge: "attention" as const },
  { href: "/admin/orders", label: "Заказы", icon: Package },
  { href: "/admin/clients", label: "Клиенты", icon: Users },
  { href: "/admin/books", label: "Книги", icon: BookOpen },
  { href: "/admin/tasks", label: "Задачи", icon: CheckSquare, badge: "tasks" as const },
  { href: "/admin/promo", label: "Промокоды", icon: Tag },
  { href: "/admin/gifts", label: "Сертификаты", icon: Gift },
  { href: "/admin/team", label: "Доступы", icon: KeyRound },
];

export function AdminNav({ counters, adminName, variant }: { counters: { attention: number; tasks: number }; adminName: string; variant: "sidebar" | "mobile" }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const nav = (
    <nav className="flex flex-col gap-0.5">
      {items.map((it) => {
        const active = it.exact ? pathname === it.href : pathname.startsWith(it.href);
        const badge = it.badge ? counters[it.badge] : 0;
        return (
          <Link
            key={it.href}
            href={it.href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
              active ? "bg-white font-medium text-ink shadow-soft" : "text-ink-soft hover:bg-white/60",
            )}
          >
            <it.icon className={cn("size-4", active ? "text-wine" : "text-muted")} strokeWidth={1.8} />
            <span className="flex-1">{it.label}</span>
            {badge ? <span className="rounded-full bg-wine px-1.5 py-0.5 text-[11px] leading-none font-semibold text-white tabular-nums">{badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
  if (variant === "sidebar")
    return (
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto border-r border-line bg-[#f1ece4] px-3 py-4 lg:flex">
        <Link href="/admin" className="mb-6 flex items-center gap-2.5 px-2 font-semibold">
          <LogoMark className="size-8" /> MyBooks CRM
        </Link>
        {nav}
        <div className="mt-auto space-y-1 border-t border-line pt-4 text-sm">
          <div className="truncate px-3 text-xs text-muted">{adminName}</div>
          <Link href="/books" className="block rounded-xl px-3 py-2 text-ink-soft hover:bg-white/60">
            ← На сайт
          </Link>
        </div>
      </aside>
    );
  return (
    <>
      <button className="btn btn-ghost btn-sm size-9 px-0 lg:hidden" onClick={() => setOpen(true)} aria-label="Меню">
        <Menu className="size-5" />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setOpen(false)} />
          <div className="relative h-full w-72 bg-[#f1ece4] p-4">
            <div className="mb-6 flex items-center justify-between">
              <span className="flex items-center gap-2 font-semibold">
                <LogoMark className="size-8" /> MyBooks CRM
              </span>
              <button onClick={() => setOpen(false)} aria-label="Закрыть">
                <X className="size-5" />
              </button>
            </div>
            {nav}
            <Link href="/books" className="mt-6 block px-3 text-sm text-muted">
              ← На сайт
            </Link>
          </div>
        </div>
      ) : null}
    </>
  );
}
