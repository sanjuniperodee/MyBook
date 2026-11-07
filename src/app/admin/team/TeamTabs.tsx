"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ScrollActive } from "../settings/ScrollActive";

/** Разделы «Команды»: подчёркнутая активная вкладка (стиль .tabs/.tab из кита), лента листается вбок на телефоне. */
export function TeamTabs({ showAudit }: { showAudit: boolean }) {
  const pathname = usePathname();
  const tabs = [
    { href: "/admin/team", label: "Сотрудники" },
    { href: "/admin/team/roles", label: "Роли и права" },
    { href: "/admin/team/plans", label: "Планы продаж" },
    ...(showAudit ? [{ href: "/admin/team/audit", label: "Журнал действий" }] : []),
  ];
  return (
    <ScrollActive>
      <nav aria-label="Разделы команды" className="tabs">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} aria-current={pathname === t.href ? "page" : undefined} className="tab">
            {t.label}
          </Link>
        ))}
      </nav>
    </ScrollActive>
  );
}
