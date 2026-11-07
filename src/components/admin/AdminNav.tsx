"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
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

/** Раздел CRM: значок на рейке слева, страницы раздела — вкладки в шапке. */
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
    <span className={cn("relative size-5 shrink-0", className)}>
      <Icon className={cn("size-5 transition-opacity", pending && "opacity-0")} strokeWidth={1.7} aria-hidden />
      <LoaderCircle className={cn("absolute inset-0 size-5 animate-spin transition-opacity", pending ? "opacity-100" : "opacity-0")} strokeWidth={2} aria-hidden />
    </span>
  );
}

/**
 * Рейка CRM (DESIGN.md §7.1): узкая светлая колонка на ноутбуке — шесть разделов значком и подписью, на значке — сумма
 * счётчиков раздела; внизу — профиль (смена, тема, выход). Страницы раздела — вкладки в шапке (SectionTabs).
 * На телефоне вместо рейки — нижняя панель и экран «Ещё» (MobileTabBar, MoreMenu).
 */
export function AdminNav({ adminName, roleName, perms, onShift }: { adminName: string; roleName: string; perms: Permission[]; onShift: boolean }) {
  const pathname = usePathname();
  const { counters } = useLive().live;
  const domains = visibleDomains(perms);
  const current = activeDomain(domains, pathname)?.domain.key;
  return (
    <aside className="crm-rail sticky top-0 hidden h-dvh w-[4.5rem] shrink-0 flex-col items-center border-r border-line bg-white py-3 lg:flex" aria-label="Разделы CRM">
      <Link href="/admin" aria-label="MyBooks CRM, обзор" className="mb-4 flex size-10 items-center justify-center rounded-xl transition-colors hover:bg-sunken">
        <LogoMark className="size-7" />
      </Link>
      <nav className="no-scrollbar flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto px-2">
        {domains.map((d) => {
          const active = d.key === current;
          const total = d.items.reduce((a, it) => a + (it.badge ? counters[it.badge] : 0), 0);
          return (
            <Link
              key={d.key}
              href={d.items[0].href}
              aria-current={active ? "true" : undefined}
              title={d.label}
              className={cn(
                "relative flex w-full flex-col items-center gap-1 rounded-[10px] px-1 pt-2 pb-1.5 text-[10.5px] leading-none font-medium transition-colors",
                active ? "bg-rose text-wine" : "text-muted hover:bg-sunken hover:text-ink",
              )}
            >
              <NavIcon icon={d.icon} />
              <span>{d.label}</span>
              {total ? (
                <span className="count count-alert absolute top-0.5 right-1 h-4 min-w-4 px-1 text-[10px]" data-badge={d.key} aria-label={`${total} требуют внимания`}>
                  {total > 99 ? "99+" : total}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <UserMenu adminName={adminName} roleName={roleName} onShift={onShift} canShift={perms.includes("deals.edit") || perms.includes("chats.send")} />
    </aside>
  );
}

/**
 * Вкладки раздела в шапке: страницы активного раздела, у каждой — свой живой счётчик. У страниц вне карты (поиск и т. п.)
 * вкладок нет — только название.
 */
export function SectionTabs({ perms, fallback }: { perms: Permission[]; fallback?: string }) {
  const pathname = usePathname();
  const { counters } = useLive().live;
  const domains = visibleDomains(perms);
  const cur = activeDomain(domains, pathname);
  if (!cur) return <span className="text-[13px] font-semibold">{fallback ?? "CRM"}</span>;
  const { domain, item: here } = cur;
  return (
    <div className="flex h-full min-w-0 items-stretch gap-4">
      <span className="flex shrink-0 items-center text-[13px] font-semibold">{domain.label}</span>
      {domain.items.length > 1 ? (
        <>
          <span className="my-3.5 w-px shrink-0 bg-line" aria-hidden />
          <nav aria-label={`Страницы раздела «${domain.label}»`} className="no-scrollbar flex h-full min-w-0 items-stretch gap-0.5 overflow-x-auto">
            {domain.items.map((it) => {
              const active = it.href === here.href;
              const n = it.badge ? counters[it.badge] : 0;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex shrink-0 items-center gap-1.5 px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors",
                    active ? "text-ink after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-t-full after:bg-wine" : "text-muted hover:text-ink",
                  )}
                >
                  {it.label}
                  {n ? (
                    <span className="count count-alert h-4 min-w-4 px-1 text-[10px]" data-badge={it.badge}>
                      {n > 99 ? "99+" : n}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </>
      ) : null}
    </div>
  );
}
