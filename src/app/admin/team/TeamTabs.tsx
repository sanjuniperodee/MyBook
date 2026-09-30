"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function TeamTabs({ showAudit }: { showAudit: boolean }) {
  const pathname = usePathname();
  const tabs = [
    { href: "/admin/team", label: "Сотрудники" },
    { href: "/admin/team/roles", label: "Роли и права" },
    { href: "/admin/team/plans", label: "Планы продаж" },
    ...(showAudit ? [{ href: "/admin/team/audit", label: "Журнал действий" }] : []),
  ];
  return (
    <nav className="flex gap-1 border-b border-line">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={cn("-mb-px border-b-2 px-3 py-2 text-sm", pathname === t.href ? "border-wine font-medium text-ink" : "border-transparent text-muted hover:text-ink")}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
