import Link from "next/link";
import { cn } from "@/lib/class-names";

export interface TabItem {
  key: string;
  label: React.ReactNode;
  href: string;
  active: boolean;
  /** Число рядом с названием (сколько записей, сколько ждёт внимания). */
  count?: number | string | null;
  /** Счётчик требует действия — винная плашка вместо серой. */
  alert?: boolean;
}

/**
 * Вкладки страницы ссылками (DESIGN.md §6): подчёркнутая активная, счётчик справа. Для разделов внутри одной страницы
 * (сделка: «Обзор / Оплаты / История»); страницы CRM — в боковой панели (AdminNav), а переключатель
 * периода или вида — Segmented. Лента листается вбок, не переносится.
 */
export function Tabs({ items, label, className }: { items: TabItem[]; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn("tabs", className)}>
      {items.map((it) => (
        <Link key={it.key} href={it.href} aria-current={it.active ? "page" : undefined} className="tab">
          {it.label}
          {it.count !== undefined && it.count !== null && it.count !== "" ? <span className={cn("count", it.alert && "count-alert")}>{it.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
