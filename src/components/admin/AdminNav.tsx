"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Coins,
  Globe,
  BookOpen,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  CheckSquare,
  Gift,
  Handshake,
  Kanban,
  Link2,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  Megaphone,
  MessageSquareQuote,
  MessagesSquare,
  Package,
  PhoneCall,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
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
import { UserMenu } from "./UserMenu";
import { NAV_RAIL_COOKIE, type NavMode } from "./nav-rail";

export { ShiftToggle } from "./ShiftToggle";
import { cn } from "@/lib/class-names";

export interface Item {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: keyof CrmCounters;
  /** Пункт виден, если есть хотя бы одно из прав. Без perm — всем сотрудникам. */
  perm?: Permission[];
  /** Слова для палитры команд (⌘K): по ним пункт находится, хотя в названии их нет. */
  keywords?: string;
}

/** Группа CRM в боковой панели: заголовок и её страницы. */
export interface Domain {
  key: string;
  label: string;
  icon: LucideIcon;
  items: Item[];
}

/**
 * Карта CRM (DESIGN.md §7.1): шесть разделов по задачам человека, а не плоский список из двадцати пунктов.
 * Порядок — от ежедневной работы к настройке; права фильтруют пункты, пустой раздел не показывается.
 */
export const navDomains: Domain[] = [
  {
    key: "today",
    label: "Сегодня",
    icon: LayoutDashboard,
    items: [
      { href: "/admin", label: "Обзор", icon: LayoutDashboard, exact: true, keywords: "главная дашборд сводка" },
      { href: "/admin/tasks", label: "Задачи", icon: CheckSquare, badge: "tasks", keywords: "дела напоминания" },
    ],
  },
  {
    key: "sales",
    label: "Продажи",
    icon: Handshake,
    items: [
      { href: "/admin/deals", label: "Сделки", icon: Handshake, badge: "deals", perm: ["deals.view"], keywords: "воронка лиды заявки" },
      { href: "/admin/chats", label: "Чаты", icon: MessagesSquare, badge: "chats", perm: ["chats.view"], keywords: "whatsapp переписка сообщения" },
      { href: "/admin/clients", label: "Клиенты", icon: Users, perm: ["clients.view"], keywords: "база контакты" },
      { href: "/admin/calls", label: "Звонки", icon: PhoneCall, badge: "calls", perm: ["calls.view"], keywords: "телефон записи" },
      { href: "/admin/templates", label: "Шаблоны", icon: MessageSquareQuote, perm: ["chats.view"], keywords: "ответы быстрые сообщения" },
    ],
  },
  {
    key: "production",
    label: "Выпуск",
    icon: Package,
    items: [
      { href: "/admin/board", label: "Канбан заказов", icon: Kanban, badge: "attention", perm: ["orders.view"], keywords: "производство печать" },
      { href: "/admin/orders", label: "Заказы", icon: Package, perm: ["orders.view"], keywords: "печать доставка" },
      { href: "/admin/books", label: "Книги", icon: BookOpen, perm: ["clients.view"], keywords: "макеты проекты" },
    ],
  },
  {
    key: "money",
    label: "Деньги",
    icon: Wallet,
    items: [
      { href: "/admin/finance", label: "Финансы", icon: Wallet, badge: "finance", perm: ["analytics.view"], keywords: "оплаты поступления возвраты касса kaspi" },
      { href: "/admin/analytics", label: "Аналитика продаж", icon: BarChart3, perm: ["analytics.view"], keywords: "отчёты воронка выручка" },
    ],
  },
  {
    key: "marketing",
    label: "Маркетинг",
    icon: Megaphone,
    items: [
      { href: "/admin/marketing", label: "Ссылки и каналы", icon: Link2, perm: ["analytics.view", "promo.manage"], keywords: "utm реклама источники" },
      { href: "/admin/promo", label: "Промокоды", icon: Tag, perm: ["promo.manage"], keywords: "скидки" },
      { href: "/admin/gifts", label: "Сертификаты", icon: Gift, perm: ["gifts.manage"], keywords: "подарочные" },
      { href: "/admin/reviews", label: "Отзывы", icon: Star, badge: "reviews", perm: ["reviews.manage"] },
      { href: "/admin/ai-designer", label: "ИИ-дизайнер", icon: Sparkles, perm: ["analytics.view"], keywords: "обложки пакеты" },
    ],
  },
  {
    key: "setup",
    label: "Настройки",
    icon: SlidersHorizontal,
    items: [
      { href: "/admin/automations", label: "Автоматизации", icon: Workflow, perm: ["settings.manage"], keywords: "правила роботы" },
      { href: "/admin/pricing", label: "Цены и тарифы", icon: Coins, perm: ["settings.manage"], keywords: "стоимость" },
      { href: "/admin/site", label: "Сайт", icon: Globe, perm: ["settings.manage"], keywords: "витрина блог" },
      { href: "/admin/settings", label: "Интеграции", icon: Settings, perm: ["settings.manage"], keywords: "whatsapp kaspi бот почта" },
      { href: "/admin/team", label: "Команда", icon: ShieldCheck, perm: ["team.manage"], keywords: "сотрудники роли доступ" },
      { href: "/admin/security", label: "Безопасность", icon: LockKeyhole, keywords: "пароль 2fa" },
    ],
  },
];

/** Плоский список по разделам — для «Ещё» на телефоне (там разделов-вкладок нет). */
export const navSections: { title?: string; items: Item[] }[] = navDomains.map((d, i) => ({ title: i === 0 ? undefined : d.label, items: d.items }));

const allowedItems = (d: Domain, perms: Set<Permission>) => d.items.filter((it) => !it.perm || it.perm.some((p) => perms.has(p)));

/** Разделы, доступные по правам (пустые убраны), с отфильтрованными пунктами. */
export function visibleDomains(perms: Permission[]): Domain[] {
  const allowed = new Set(perms);
  return navDomains.map((d) => ({ ...d, items: allowedItems(d, allowed) })).filter((d) => d.items.length);
}

const isActive = (it: Item, pathname: string) => (it.exact ? pathname === it.href : pathname === it.href || pathname.startsWith(`${it.href}/`));

/** Раздел, к которому относится адрес: тот, чей пункт совпал самым длинным путём. */
export function activeDomain(domains: Domain[], pathname: string): { domain: Domain; item: Item } | null {
  let best: { domain: Domain; item: Item } | null = null;
  for (const domain of domains)
    for (const item of domain.items) if (isActive(item, pathname) && (!best || item.href.length > best.item.href.length)) best = { domain, item };
  return best;
}

/**
 * Отклик на клик: страницы CRM собираются на сервере и заранее не подгружаются, поэтому с момента нажатия до ответа
 * значок показывает, что переход идёт. Он занимает то же место — ничего не прыгает.
 */
function NavIcon({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span className={cn("relative size-4 shrink-0", className)}>
      <Icon className={cn("size-4 transition-opacity", pending && "opacity-0")} strokeWidth={1.8} aria-hidden />
      <LoaderCircle className={cn("absolute inset-0 size-4 animate-spin transition-opacity", pending ? "opacity-100" : "opacity-0")} strokeWidth={2} aria-hidden />
    </span>
  );
}

/** Группы боковой панели, свёрнутые по умолчанию: настройка нужна реже ежедневной работы. */
const FOLDED_BY_DEFAULT = ["setup"];
const GROUPS_KEY = "crm-nav-groups";

/**
 * Боковая панель CRM (DESIGN.md §7.1): все страницы подписями, по группам — без второго уровня во вкладках шапки.
 * У каждой страницы свой живой счётчик. Группы сворачиваются (кроме «Сегодня»), выбор запоминается; группа с открытой
 * страницей всегда раскрыта. Панель сворачивается в рейку значков (для доски сделок и широких таблиц) — режим хранится
 * в cookie. Внизу — профиль (смена, тема, выход). На телефоне вместо панели — нижняя панель и «Ещё».
 */
export function AdminNav({ adminName, roleName, perms, onShift, mode: modeInitial = "auto" }: { adminName: string; roleName: string; perms: Permission[]; onShift: boolean; mode?: NavMode }) {
  const pathname = usePathname();
  const { counters } = useLive().live;
  const domains = visibleDomains(perms);
  const current = activeDomain(domains, pathname);
  // auto — полная панель от 1280 px, уже — рейка значков; full / rail — выбор человека (кнопка в шапке панели).
  const [mode, setMode] = useState<NavMode>(modeInitial);
  const rail = mode === "rail";
  const auto = mode === "auto";
  /** Классы: полная панель, рейка; в режиме auto — полная плюс рейка ниже xl (те же классы с max-xl:, выписаны целиком для Tailwind). */
  const v = (full: string, railCls: string, autoRail: string) => (rail ? railCls : auto ? cn(full, autoRail) : full);
  const [folded, setFolded] = useState<string[]>(FOLDED_BY_DEFAULT);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(GROUPS_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- выбор человека известен только в браузере
      if (saved) setFolded(JSON.parse(saved) as string[]);
    } catch {}
  }, []);
  const toggleGroup = (key: string) =>
    setFolded((f) => {
      const next = f.includes(key) ? f.filter((k) => k !== key) : [...f, key];
      try {
        localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  const toggleRail = () => {
    // Что видно сейчас: в auto это зависит от ширины окна.
    const narrowNow = rail || (auto && window.innerWidth < 1280);
    const next: NavMode = narrowNow ? "full" : "rail";
    document.cookie = `${NAV_RAIL_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    setMode(next);
  };

  return (
    <aside
      className={cn("crm-sidebar sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-white transition-[width] duration-200 lg:flex", v("w-60", "w-16", "max-xl:w-16"))}
      aria-label="Разделы CRM"
    >
      <div className={cn("flex h-12 shrink-0 items-center border-b border-line", v("gap-2.5 pr-2 pl-4", "justify-center p-0", "max-xl:justify-center max-xl:p-0"))}>
        <Link href="/admin" aria-label="MyBooks CRM, обзор" className={cn("flex items-center gap-2.5 rounded-lg", v("", "hidden", "max-xl:hidden"))}>
          <LogoMark className="size-7 rounded-[7px]" />
          <span className="text-[14px] font-semibold tracking-[-0.01em]">MyBooks</span>
        </Link>
        <button
          type="button"
          onClick={toggleRail}
          className={cn("flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-ink", v("ml-auto", "ml-0", "max-xl:ml-0"))}
          aria-label="Свернуть или развернуть панель"
          title="Свернуть или развернуть панель"
        >
          <PanelLeftOpen className={cn("size-4", v("hidden", "block", "max-xl:block"))} strokeWidth={1.8} aria-hidden />
          <PanelLeftClose className={cn("size-4", v("block", "hidden", "max-xl:hidden"))} strokeWidth={1.8} aria-hidden />
        </button>
      </div>

      <nav className={cn("no-scrollbar flex flex-1 flex-col overflow-y-auto py-2", v("px-2.5", "items-center gap-0.5 px-2", "max-xl:items-center max-xl:gap-0.5 max-xl:px-2"))}>
        {domains.map((d, i) => {
          // Свёрнутая группа: на полной панели пункты скрыты, в рейке (ниже xl в auto) — видны всегда.
          const open = i === 0 || rail || !folded.includes(d.key) || current?.domain.key === d.key;
          const hidden = d.items.reduce((a, it) => a + (it.badge ? counters[it.badge] : 0), 0);
          return (
            <div key={d.key} className={cn(v(i > 0 ? "mt-3" : "", "contents", "max-xl:contents"))}>
              {i > 0 ? (
                <>
                  {rail || auto ? <span className={cn("my-1.5 h-px w-6 shrink-0 bg-line", auto && "xl:hidden")} aria-hidden /> : null}
                  {!rail ? (
                    <button
                      type="button"
                      onClick={() => toggleGroup(d.key)}
                      aria-expanded={open}
                      className={cn("group flex h-7 w-full items-center gap-1 rounded-md px-2 text-left text-xs font-semibold text-muted transition-colors hover:text-ink", auto && "max-xl:hidden")}
                    >
                      {d.label}
                      <ChevronDown className={cn("size-3.5 opacity-0 transition group-hover:opacity-100", !open && "-rotate-90 opacity-100")} strokeWidth={2} aria-hidden />
                      {!open && hidden ? (
                        <span className="count count-alert ml-auto h-4 min-w-4 px-1 text-[10px]" aria-label={`${hidden} требуют внимания`}>
                          {hidden > 99 ? "99+" : hidden}
                        </span>
                      ) : null}
                    </button>
                  ) : null}
                </>
              ) : null}
              {open || auto
                ? d.items.map((it) => {
                    const active = current?.item.href === it.href;
                    const n = it.badge ? counters[it.badge] : 0;
                    return (
                      <Link
                        key={it.href}
                        href={it.href}
                        aria-current={active ? "page" : undefined}
                        title={rail || auto ? it.label : undefined}
                        className={cn(
                          "relative flex shrink-0 items-center rounded-lg text-[13.5px] transition-colors",
                          v("h-8 w-full gap-2.5 px-2", "size-10 justify-center gap-0 px-0", "max-xl:size-10 max-xl:justify-center max-xl:gap-0 max-xl:px-0"),
                          !open && "xl:hidden",
                          active ? "bg-sunken font-semibold text-ink" : "text-ink-soft hover:bg-sunken/70 hover:text-ink",
                        )}
                      >
                        <NavIcon icon={it.icon} className={active ? "text-wine" : "text-muted"} />
                        <span className={cn(v("min-w-0 flex-1 truncate", "sr-only", "max-xl:sr-only"))}>{it.label}</span>
                        {n ? (
                          <span className={cn("count count-alert h-4 min-w-4 px-1 text-[10px]", v("", "absolute top-0.5 right-0.5", "max-xl:absolute max-xl:top-0.5 max-xl:right-0.5"))} data-badge={it.badge}>
                            {n > 99 ? "99+" : n}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })
                : null}
            </div>
          );
        })}
      </nav>

      <div className={cn("shrink-0 border-t border-line p-2", v("", "flex justify-center", "max-xl:flex max-xl:justify-center"))}>
        <UserMenu adminName={adminName} roleName={roleName} onShift={onShift} canShift={perms.includes("deals.edit") || perms.includes("chats.send")} wide={rail ? false : auto ? "xl" : true} />
      </div>
    </aside>
  );
}
