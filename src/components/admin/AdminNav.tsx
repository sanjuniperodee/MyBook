"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { setShiftAction } from "@/app/admin/crm-actions";
import { logoutAction } from "@/app/(auth)/actions";
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
  LogOut,
  MessageSquareQuote,
  MessagesSquare,
  Package,
  PhoneCall,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  Users,
  Wallet,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { LogoMark } from "@/components/Logo";
import type { Permission } from "@/shared/domain/permissions";
import type { CrmCounters } from "@/modules/reporting";
import { useLive } from "./CrmLive";
import { cn } from "@/lib/class-names";
import { toastError } from "@/components/ui/overlays";

export interface Item {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: keyof CrmCounters;
  /** Пункт виден, если есть хотя бы одно из прав. Без perm — всем сотрудникам. */
  perm?: Permission[];
}

export const navSections: { title?: string; items: Item[] }[] = [
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
      { href: "/admin/ai-designer", label: "ИИ-дизайнер", icon: Sparkles, perm: ["analytics.view"] },
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
      <Icon className={cn("size-4 transition-opacity", pending && "opacity-0", active ? "text-[#e8a0ab]" : "text-[#a89c90]")} strokeWidth={1.8} aria-hidden />
      <LoaderCircle className={cn("absolute inset-0 size-4 animate-spin text-[#e8a0ab] transition-opacity", pending ? "opacity-100" : "opacity-0")} strokeWidth={2} aria-hidden />
    </span>
  );
}

/**
 * «На смене»: получает ли сотрудник новые заявки по кругу. Переключатель (role="switch"); compact — строка под именем в
 * боковом меню, row — строка на всю ширину с подписью и тумблером (экран «Ещё» на телефоне, зона нажатия 48 px).
 * Не сохранилось — возвращаем как было и говорим об этом.
 */
export function ShiftToggle({ initial, variant = "compact" }: { initial: boolean; variant?: "compact" | "row" | "spine" }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const toggle = () => {
    const next = !on;
    setOn(next);
    start(async () => {
      try {
        await setShiftAction(next);
      } catch (e) {
        setOn(!next);
        toastError(e, "Не удалось сменить статус смены");
      }
    });
  };
  const hint = on ? "Вы получаете новые заявки по кругу" : "Новые заявки вам не распределяются";
  if (variant === "row")
    return (
      <button type="button" role="switch" aria-checked={on} disabled={pending} onClick={toggle} className="flex min-h-12 w-full items-center gap-3 rounded-xl py-1 text-left" data-testid="shift-toggle">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium">{on ? "На смене" : "Не на смене"}</span>
          <span className="block text-xs text-muted">{hint}</span>
        </span>
        <span className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-emerald-600" : "bg-ink/15")} aria-hidden>
          <span className={cn("absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow-soft transition-transform", on && "translate-x-5")} style={{ backgroundColor: "#fff" }} />
        </span>
      </button>
    );
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={pending}
      onClick={toggle}
      className={cn("flex min-h-8 w-full items-center gap-2 rounded-lg px-1.5 text-xs", variant === "spine" ? "text-[#cfc4b8] hover:bg-[rgb(255_255_255/0.05)] hover:text-white" : "-mx-1 text-ink-soft hover:bg-ink/5 hover:text-ink")}
      title={`${hint}. Нажмите, чтобы ${on ? "уйти со смены" : "выйти на смену"}`}
      data-testid="shift-toggle"
    >
      <span className={cn("size-2 rounded-full", on ? "bg-[#4cc38a]" : variant === "spine" ? "bg-[rgb(255_255_255/0.25)]" : "bg-muted/40")} aria-hidden />
      {on ? "На смене — заявки идут вам" : "Не на смене"}
    </button>
  );
}

/**
 * Корешок CRM (DESIGN.md §1): тёмная боковая панель на всю высоту на ноутбуке — разделы по правам с живыми счётчиками,
 * внизу — кто вошёл, смена, сайт и выход. На телефоне вместо неё — нижняя панель и экран «Ещё» (MobileTabBar, MoreMenu).
 */
export function AdminNav({ adminName, roleName, perms, onShift }: { adminName: string; roleName: string; perms: Permission[]; onShift: boolean }) {
  const pathname = usePathname();
  const { counters } = useLive().live;
  const allowed = new Set(perms);
  const visible = navSections.map((s) => ({ ...s, items: s.items.filter((it) => !it.perm || it.perm.some((p) => allowed.has(p))) })).filter((s) => s.items.length);
  return (
    <aside className="crm-spine sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-spine text-[#e9e1d7] lg:flex" aria-label="Разделы CRM">
      <Link href="/admin" className="mx-3 mt-3 mb-2 flex h-11 items-center gap-2.5 rounded-[10px] px-2 text-[15px] font-semibold text-white hover:bg-[rgb(255_255_255/0.06)]">
        <LogoMark className="size-7" /> MyBooks
        <span className="ml-auto rounded-md bg-[rgb(255_255_255/0.1)] px-1.5 py-0.5 text-[11px] font-medium text-[#e9e1d7]">CRM</span>
      </Link>
      <nav className="no-scrollbar flex flex-1 flex-col gap-4 overflow-y-auto px-3 pt-2 pb-4">
        {visible.map((s, i) => (
          <div key={s.title ?? i} className="flex flex-col gap-px">
            {s.title ? <div className="px-2.5 pb-1 text-xs text-[#a89c90]">{s.title}</div> : null}
            {s.items.map((it) => {
              const active = it.exact ? pathname === it.href : pathname.startsWith(it.href);
              const badge = it.badge ? counters[it.badge] : 0;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors duration-150",
                    active ? "bg-[rgb(255_255_255/0.09)] font-medium text-white before:absolute before:inset-y-2 before:-left-3 before:w-[3px] before:rounded-r-full before:bg-[#e8a0ab]" : "text-[#cfc4b8] hover:bg-[rgb(255_255_255/0.05)] hover:text-white",
                  )}
                >
                  <NavIcon icon={it.icon} active={active} />
                  <span className="flex-1 truncate">{it.label}</span>
                  {badge ? (
                    <span className="min-w-5 rounded-md bg-[#c94b5f] px-1.5 py-0.5 text-center text-[11px] leading-none font-semibold text-white tabular-nums" data-badge={it.badge}>
                      {badge > 99 ? "99+" : badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="border-t border-[rgb(255_255_255/0.1)] p-3">
        <div className="flex items-center gap-2.5 px-1.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#c94b5f] text-sm font-semibold text-white uppercase" aria-hidden>
            {adminName.slice(0, 1) || "?"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">{adminName}</div>
            <div className="truncate text-xs text-[#a89c90]">{roleName}</div>
          </div>
        </div>
        {allowed.has("deals.edit") || allowed.has("chats.send") ? (
          <div className="mt-2 px-1">
            <ShiftToggle initial={onShift} variant="spine" />
          </div>
        ) : null}
        <div className="mt-2 flex gap-1">
          <Link href="/books" className="flex h-9 flex-1 items-center gap-2 rounded-lg px-2.5 text-sm text-[#cfc4b8] hover:bg-[rgb(255_255_255/0.05)] hover:text-white">
            <Globe className="size-4" strokeWidth={1.8} aria-hidden /> На сайт
          </Link>
          <form action={logoutAction}>
            <button className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm text-[#cfc4b8] hover:bg-[rgb(255_255_255/0.05)] hover:text-white" title="Выйти из CRM">
              <LogOut className="size-4" strokeWidth={1.8} aria-hidden /> Выйти
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
