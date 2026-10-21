"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { setShiftAction } from "@/app/admin/crm-actions";
import {
  BarChart3,
  Coins,
  Globe,
  BookOpen,
  CheckSquare,
  Gift,
  Handshake,
  Kanban,
  Link2,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  Menu,
  MessageSquareQuote,
  MessagesSquare,
  Package,
  PhoneCall,
  Settings,
  ShieldCheck,
  Star,
  Tag,
  Users,
  Wallet,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import { LogoMark } from "@/components/Logo";
import type { Permission } from "@/shared/domain/permissions";
import type { CrmCounters } from "@/modules/reporting";
import { useLive } from "./CrmLive";
import { cn } from "@/lib/class-names";

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
      { href: "/admin/templates", label: "Шаблоны", icon: MessageSquareQuote, perm: ["chats.view"] },
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
      // Деньги: пришло, ожидается, переплаты; бейдж — ручные подтверждения без проверки (считаются только руководителю).
      { href: "/admin/finance", label: "Финансы", icon: Wallet, badge: "finance", perm: ["analytics.view"] },
      { href: "/admin/marketing", label: "Ссылки и каналы", icon: Link2, perm: ["analytics.view", "promo.manage"] },
      { href: "/admin/promo", label: "Промокоды", icon: Tag, perm: ["promo.manage"] },
      { href: "/admin/gifts", label: "Сертификаты", icon: Gift, perm: ["gifts.manage"] },
      { href: "/admin/reviews", label: "Отзывы", icon: Star, badge: "reviews", perm: ["reviews.manage"] },
    ],
  },
  {
    title: "Настройки",
    items: [
      { href: "/admin/automations", label: "Автоматизации", icon: Workflow, perm: ["settings.manage"] },
      { href: "/admin/pricing", label: "Цены и тарифы", icon: Coins, perm: ["settings.manage"] },
      { href: "/admin/site", label: "Сайт", icon: Globe, perm: ["settings.manage"] },
      { href: "/admin/settings", label: "Интеграции", icon: Settings, perm: ["settings.manage"] },
    ],
  },
  {
    title: "Доступ",
    items: [
      { href: "/admin/team", label: "Команда", icon: ShieldCheck, perm: ["team.manage"] },
      { href: "/admin/security", label: "Безопасность", icon: LockKeyhole },
    ],
  },
];

/**
 * Отклик на клик по пункту меню: страницы CRM собираются на сервере и заранее не подгружаются, поэтому с момента
 * нажатия до ответа пункт показывает, что переход идёт. Иконка занимает то же место — ничего не прыгает.
 */
function NavIcon({ icon: Icon, active }: { icon: LucideIcon; active: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <span className="relative size-4 shrink-0">
      <Icon className={cn("size-4 transition-opacity", pending && "opacity-0", active ? "text-wine" : "text-muted")} strokeWidth={1.8} />
      <LoaderCircle className={cn("absolute inset-0 size-4 animate-spin text-wine transition-opacity", pending ? "opacity-100" : "opacity-0")} strokeWidth={2} aria-hidden />
    </span>
  );
}

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

  useEffect(() => {
    if (variant !== "mobile" || !open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, variant]);

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
                <NavIcon icon={it.icon} active={active} />
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
      <button
        type="button"
        className="btn btn-ghost btn-sm size-9 px-0 lg:hidden"
        onClick={() => setOpen(true)}
        aria-label="Открыть меню"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="admin-mobile-menu"
      >
        <Menu className="size-5" />
      </button>
      {open
        ? createPortal(
            <div className="fixed inset-0 z-50 lg:hidden">
              <button
                type="button"
                className="absolute inset-0 cursor-default bg-ink/30"
                onClick={() => setOpen(false)}
                aria-label="Закрыть меню"
              />
              <div
                id="admin-mobile-menu"
                role="dialog"
                aria-modal="true"
                aria-label="Навигация CRM"
                className="relative flex h-dvh w-72 max-w-[calc(100vw-2rem)] flex-col gap-6 overflow-y-auto bg-[#f1ece4] p-4 shadow-lift"
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-semibold">
                    <LogoMark className="size-8" /> MyBooks CRM
                  </span>
                  <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть">
                    <X className="size-5" />
                  </button>
                </div>
                {nav}
                <div className="mt-auto">{footer}</div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
