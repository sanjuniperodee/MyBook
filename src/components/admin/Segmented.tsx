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
 * выбранный чернильный, высота 40 на телефоне (палец) и 32 на компьютере, лента листается вбок, а не переносится.
 */
export function Segmented({ items, label, className }: { items: SegmentItem[]; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn("no-scrollbar flex max-w-full overflow-x-auto rounded-xl border border-line bg-white p-1 text-sm", className)}>
      {items.map((it) => (
        <Link
          key={it.key}
          href={it.href}
          aria-current={it.active ? "page" : undefined}
          className={cn("inline-flex min-h-10 shrink-0 items-center rounded-lg px-3 whitespace-nowrap transition-colors lg:min-h-8", it.active ? "bg-ink font-medium text-white" : "text-ink-soft hover:bg-cream")}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
