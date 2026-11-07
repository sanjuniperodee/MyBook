import Link from "next/link";
import { cn } from "@/lib/class-names";

export interface SegmentItem {
  key: string;
  label: React.ReactNode;
  href: string;
  active: boolean;
}

/**
 * Переключатель периода или вида ссылками («7 дней · 30 дней · 90 дней», «Воронка · Список»): один вид на всех экранах CRM —
 * выбранный — белая «шашка» на подложке, высота 40 на телефоне (палец) и 28 на компьютере, лента листается вбок, а не переносится.
 */
export function Segmented({ items, label, className }: { items: SegmentItem[]; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn("no-scrollbar flex max-w-full overflow-x-auto rounded-[var(--r-ctl)] bg-sunken p-0.5 text-[13px]", className)}>
      {items.map((it) => (
        <Link
          key={it.key}
          href={it.href}
          aria-current={it.active ? "page" : undefined}
          className={cn("inline-flex min-h-10 shrink-0 items-center rounded-[calc(var(--r-ctl)-2px)] px-3 font-medium whitespace-nowrap transition-colors lg:min-h-7", it.active ? "bg-white text-ink shadow-[0_1px_2px_rgb(0_0_0/0.12),0_0_0_1px_rgb(0_0_0/0.04)]" : "text-muted hover:text-ink")}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
