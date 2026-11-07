import { cn } from "@/lib/class-names";

export interface Fact {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Не показывать строку (нет данных) — без проверок в разметке страницы. */
  hidden?: boolean;
}

/**
 * Список «подпись — значение» для карточек записей (сделка, заказ, клиент): подпись приглушена слева, значение справа,
 * строки разделены линией. Длинные значения переносятся, а не раздвигают лист.
 */
export function Facts({ items, className }: { items: Fact[]; className?: string }) {
  const rows = items.filter((i) => !i.hidden);
  return (
    <dl className={cn("divide-y divide-line text-sm", className)}>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[9rem_minmax(0,1fr)]">
          <dt className="text-muted">{r.label}</dt>
          <dd className="min-w-0 break-words">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
