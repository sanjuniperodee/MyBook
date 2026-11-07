"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, CheckSquare, Ellipsis, Handshake, MessagesSquare, Package, PhoneCall, User, Users, type LucideIcon } from "lucide-react";
import type { MobileTabKey } from "@/shared/domain/mobileLayout";
import { cn } from "@/lib/class-names";
import { useLive } from "./CrmLive";
import { lastOfTab, sectionOf } from "./nav-memory";
import { scrollTo } from "./scroller";

const TABS: Record<MobileTabKey, { label: string; href: string; icon: LucideIcon; badge?: "chats" | "tasks" | "deals" | "attention" | "calls" }> = {
  overview: { label: "Обзор", href: "/admin", icon: BarChart3 },
  chats: { label: "Чаты", href: "/admin/chats", icon: MessagesSquare, badge: "chats" },
  tasks: { label: "Задачи", href: "/admin/tasks", icon: CheckSquare, badge: "tasks" },
  deals: { label: "Сделки", href: "/admin/deals", icon: Handshake, badge: "deals" },
  clients: { label: "Клиенты", href: "/admin/clients", icon: Users },
  orders: { label: "Заказы", href: "/admin/orders", icon: Package, badge: "attention" },
  calls: { label: "Звонки", href: "/admin/calls", icon: PhoneCall, badge: "calls" },
};

/**
 * Нижняя панель установленной CRM (PWA) и мобильной версии — те же вкладки по роли, что в приложении: руководитель —
 * обзор, чаты, сделки, заказы; продажи — чаты, задачи, сделки, клиенты; производство — заказы и задачи и т. д.
 * Последняя вкладка — «Ещё» (руководитель) или «Профиль» со всеми остальными разделами. На больших экранах панели нет
 * (там боковое меню). Когда открыт чат или набирается текст (клавиатура), панель прячется, чтобы не мешать.
 */
export function MobileTabBar({ tabs, profileLabel }: { tabs: MobileTabKey[]; profileLabel: "Ещё" | "Профиль" }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const { counters } = useLive().live;
  const [keyboard, setKeyboard] = useState(false);
  // Вкладка помнит, где вы в ней были (как в iOS): нажатие возвращает на последнюю открытую страницу вкладки.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage есть только в браузере: до монтирования ссылки ведут на корни вкладок, как на сервере
    setMounted(true);
  }, []);
  const chatOpen = pathname.startsWith("/admin/chats") && !!params.get("c");

  // Открытый чат — на весь экран: шапка CRM и нижняя панель скрываются (стили — globals.css, [data-chat-open]).
  useEffect(() => {
    const root = document.documentElement;
    if (!chatOpen) {
      delete root.dataset.chatOpen;
      return;
    }
    root.dataset.chatOpen = "1";
    // Видимая область (без клавиатуры) — в CSS-переменные: открытый чат прибит к ней (globals.css, [data-chat-open]).
    const vv = window.visualViewport;
    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!vv) return;
        root.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
        root.style.setProperty("--vvt", `${Math.round(vv.offsetTop)}px`);
      });
    };
    sync();
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    return () => {
      cancelAnimationFrame(frame);
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      delete root.dataset.chatOpen;
      root.style.removeProperty("--vvh");
      root.style.removeProperty("--vvt");
    };
  }, [chatOpen]);

  // Экранная клавиатура уменьшает видимую область — панель не должна подпрыгивать над ней.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const check = () => setKeyboard(window.innerHeight - vv.height > 140);
    vv.addEventListener("resize", check);
    return () => vv.removeEventListener("resize", check);
  }, []);

  if (chatOpen || keyboard) return null;
  const items = [
    ...tabs.map((k) => ({ key: k, ...TABS[k] })),
    { key: "more", label: profileLabel, href: "/admin/more", icon: profileLabel === "Ещё" ? Ellipsis : User, badge: undefined },
  ];
  // «Заказы» — и список, и доска производства. Страница, которой нет среди вкладок (клиенты, финансы, команда…), открыта
  // из «Ещё» — подсвечена «Ещё», чтобы панель всегда показывала, где человек.
  const direct = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href) || (href === "/admin/orders" && pathname.startsWith("/admin/board")));
  const elsewhere = !items.some((it) => it.key !== "more" && direct(it.href));
  const active = (href: string) => direct(href) || (href === "/admin/more" && elsewhere);
  return (
    <nav style={{ viewTransitionName: "crm-tabbar" }} className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden" aria-label="Разделы CRM" data-testid="mobile-tabbar">
      <ul className="mx-auto flex h-[3.6rem] max-w-xl">
        {items.map((it) => {
          const on = active(it.href);
          const n = it.badge ? counters[it.badge] : 0;
          // Другая вкладка — на её последнюю страницу; текущая — на корень (повторное нажатие на корне прокручивает наверх).
          const href = !on && mounted ? (lastOfTab(sectionOf(it.href)) ?? it.href) : it.href;
          return (
            <li key={it.key} className="flex-1">
              <Link
                href={href}
                prefetch
                aria-current={on ? "page" : undefined}
                onClick={(e) => {
                  if (on && pathname === it.href) {
                    e.preventDefault();
                    scrollTo(0, "smooth");
                  }
                }}
                className={cn("relative flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition active:scale-95 active:opacity-60", on ? "text-wine" : "text-muted")}>
                <span className="relative">
                  <it.icon className="size-6" strokeWidth={on ? 2.2 : 1.8} aria-hidden />
                  {n ? <span className="absolute -top-1.5 -right-3 min-w-[18px] rounded-full bg-wine px-1 text-center text-[10.5px] leading-[18px] font-semibold text-white tabular-nums">{n > 99 ? "99+" : n}</span> : null}
                </span>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
