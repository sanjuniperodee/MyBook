"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { setShiftAction } from "@/app/admin/crm-actions";
import {
  BarChart3,
  BookOpen,
  CheckSquare,
  Gift,
  Handshake,
  Kanban,
  Link2,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  MessagesSquare,
  Package,
  PhoneCall,
  Settings,
  ShieldCheck,
  Tag,
  Users,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import { LogoMark } from "@/components/Logo";
import type { Permission } from "@/lib/crm/permissions";
import type { CrmCounters } from "@/lib/crm";
import { useLive } from "./CrmLive";
import { cn } from "@/lib/utils";

interface Item {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: keyof CrmCounters;
  /** Пункт виден, если есть хотя бы одно из прав. Без perm — всем сотрудникам. */
  perm?: Permission[];
}

const sections: { title?: string; items: Item[] }[] = [
  {
    items: [
      { href: "/admin", label: "Обзор", icon: LayoutDashboard, exact: true },
      { href: "/admin/tasks", label: "Задачи", icon: CheckSquare, badge: "tasks" },
    ],
  },
  {
    title: "Продажи",
    items: [
      { href: "/admin/deals", label: "Сделки", icon: Handshake, badge: "deals", perm: ["deals.view"] },
      { href: "/admin/chats", label: "Чаты", icon: MessagesSquare, badge: "chats", perm: ["chats.view"] },
      { href: "/admin/calls", label: "Звонки", icon: PhoneCall, badge: "calls", perm: ["calls.view"] },
      { href: "/admin/clients", label: "Клиенты", icon: Users, perm: ["clients.view"] },
    ],
  },
  {
    title: "Производство",
    items: [
      { href: "/admin/board", label: "Канбан заказов", icon: Kanban, badge: "attention", perm: ["orders.view"] },
      { href: "/admin/orders", label: "Заказы", icon: Package, perm: ["orders.view"] },
      { href: "/admin/books", label: "Книги", icon: BookOpen, perm: ["clients.view"] },
    ],
  },
  {
    title: "Маркетинг",
    items: [
      { href: "/admin/analytics", label: "Аналитика продаж", icon: BarChart3, perm: ["analytics.view"] },
      { href: "/admin/marketing", label: "Ссылки и каналы", icon: Link2, perm: ["analytics.view", "promo.manage"] },
      { href: "/admin/promo", label: "Промокоды", icon: Tag, perm: ["promo.manage"] },
      { href: "/admin/gifts", label: "Сертификаты", icon: Gift, perm: ["gifts.manage"] },
    ],
  },
  {
    title: "Управление",
    items: [
      { href: "/admin/automations", label: "Автоматизации", icon: Workflow, perm: ["settings.manage"] },
      { href: "/admin/team", label: "Команда", icon: ShieldCheck, perm: ["team.manage"] },
      { href: "/admin/settings", label: "Интеграции", icon: Settings, perm: ["settings.manage"] },
      { href: "/admin/security", label: "Безопасность", icon: LockKeyhole },
    ],
  },
];

function ShiftToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const next = !on;
        setOn(next);
        start(() => setShiftAction(next));
      }}
      className="mt-1 flex items-center gap-1.5 text-[11px] text-muted hover:text-ink"
      title={on ? "Вы получаете новые заявки по кругу. Нажмите, чтобы уйти со смены" : "Новые заявки вам не распределяются. Нажмите, чтобы выйти на смену"}
      data-testid="shift-toggle"
    >
      <span className={cn("size-2 rounded-full", on ? "bg-emerald-500" : "bg-muted/40")} />
      {on ? "На смене" : "Не на смене"}
    </button>
  );
}

export function AdminNav({ adminName, roleName, perms, variant, onShift }: { adminName: string; roleName: string; perms: Permission[]; variant: "sidebar" | "mobile"; onShift: boolean }) {
  const pathname = usePathname();
  const { counters } = useLive().live;
  const [open, setOpen] = useState(false);
  const allowed = new Set(perms);
  const visible = sections.map((s) => ({ ...s, items: s.items.filter((it) => !it.perm || it.perm.some((p) => allowed.has(p))) })).filter((s) => s.items.length);
  const nav = (
    <nav className="flex flex-col gap-4">
      {visible.map((s, i) => (
        <div key={s.title ?? i} className="flex flex-col gap-0.5">
          {s.title ? <div className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-muted/80 uppercase">{s.title}</div> : null}
          {s.items.map((it) => {
            const active = it.exact ? pathname === it.href : pathname.startsWith(it.href);
            const badge = it.badge ? counters[it.badge] : 0;
            return (
              <Link
                key={it.href}
                href={it.href}
                onClick={() => setOpen(false)}
                className={cn("flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition", active ? "bg-white font-medium text-ink shadow-soft" : "text-ink-soft hover:bg-white/60")}
              >
                <it.icon className={cn("size-4", active ? "text-wine" : "text-muted")} strokeWidth={1.8} />
                <span className="flex-1">{it.label}</span>
                {badge ? (
                  <span className="rounded-full bg-wine px-1.5 py-0.5 text-[11px] leading-none font-semibold text-white tabular-nums" data-badge={it.badge}>
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
  const footer = (
    <div className="space-y-1 border-t border-line pt-4 text-sm">
      <div className="px-3">
        <div className="truncate text-xs font-medium text-ink">{adminName}</div>
        <div className="truncate text-[11px] text-muted">{roleName}</div>
        {allowed.has("deals.edit") || allowed.has("chats.send") ? <ShiftToggle initial={onShift} /> : null}
      </div>
      <Link href="/books" className="block rounded-xl px-3 py-2 text-ink-soft hover:bg-white/60">
        ← На сайт
      </Link>
    </div>
  );
  if (variant === "sidebar")
    return (
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 overflow-y-auto border-r border-line bg-[#f1ece4] px-3 py-4 lg:flex">
        <Link href="/admin" className="flex items-center gap-2.5 px-2 font-semibold">
          <LogoMark className="size-8" /> MyBooks CRM
        </Link>
        {nav}
        <div className="mt-auto">{footer}</div>
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
          <div className="relative flex h-full w-72 flex-col gap-6 overflow-y-auto bg-[#f1ece4] p-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-semibold">
                <LogoMark className="size-8" /> MyBooks CRM
              </span>
              <button onClick={() => setOpen(false)} aria-label="Закрыть">
                <X className="size-5" />
              </button>
            </div>
            {nav}
            <div className="mt-auto">{footer}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
