"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, CheckSquare, Ellipsis, Handshake, MessagesSquare, Package, PhoneCall, User, Users, type LucideIcon } from "lucide-react";
import type { MobileTabKey } from "@/shared/domain/mobileLayout";
import { cn } from "@/lib/class-names";
import { useLive } from "./CrmLive";

const TABS: Record<MobileTabKey, { label: string; href: string; icon: LucideIcon; badge?: "chats" | "tasks" | "deals" | "attention" | "calls" }> = {
  overview: { label: "Обзор", href: "/admin", icon: BarChart3 },
  chats: { label: "Чаты", href: "/admin/chats", icon: MessagesSquare, badge: "chats" },
  tasks: { label: "Задачи", href: "/admin/tasks", icon: CheckSquare, badge: "tasks" },
  deals: { label: "Сделки", href: "/admin/deals", icon: Handshake, badge: "deals" },
  clients: { label: "Клиенты", href: "/admin/clients", icon: Users },
  orders: { label: "Заказы", href: "/admin/board", icon: Package, badge: "attention" },
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
  const chatOpen = pathname.startsWith("/admin/chats") && !!params.get("c");

  // Открытый чат — на весь экран: шапка CRM и нижняя панель скрываются (стили — globals.css, [data-chat-open]).
  useEffect(() => {
    const root = document.documentElement;
    if (chatOpen) root.dataset.chatOpen = "1";
    else delete root.dataset.chatOpen;
    return () => {
      delete root.dataset.chatOpen;
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
  const active = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden" aria-label="Разделы CRM" data-testid="mobile-tabbar">
      <ul className="mx-auto flex h-[3.6rem] max-w-xl">
        {items.map((it) => {
          const on = active(it.href);
          const n = it.badge ? counters[it.badge] : 0;
          return (
            <li key={it.key} className="flex-1">
              <Link href={it.href} aria-current={on ? "page" : undefined} className={cn("relative flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition active:scale-95", on ? "text-wine" : "text-muted")}>
                <span className="relative">
                  <it.icon className={cn("size-6 transition", on && "scale-110")} strokeWidth={on ? 2.2 : 1.8} />
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
