"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/class-names";

export function TeamTabs({ showAudit }: { showAudit: boolean }) {
  const pathname = usePathname();
  const tabs = [
    { href: "/admin/team", label: "Сотрудники" },
    { href: "/admin/team/roles", label: "Роли и права" },
    { href: "/admin/team/plans", label: "Планы продаж" },
    ...(showAudit ? [{ href: "/admin/team/audit", label: "Журнал действий" }] : []),
  ];
  return (
    <nav aria-label="Разделы команды" className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={pathname === t.href ? "page" : undefined} className={cn("-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm whitespace-nowrap transition-colors", pathname === t.href ? "border-wine font-medium text-ink" : "border-transparent text-muted hover:text-ink")}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
