"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { Search } from "lucide-react";
import { MobileFilters } from "@/components/admin/MobileFilters";
import { Segmented, type SegmentItem } from "@/components/admin/Segmented";
import { cn } from "@/lib/class-names";
import { OrdersViews } from "./OrdersViews";

export interface StatusChip {
  key: string;
  label: string;
  href: string;
  count: number;
  active: boolean;
  /** Класс цвета точки статуса; у «Все» нет. */
  dot: string | null;
}

export interface ToolbarValues {
  q: string;
  plan: string;
  assignee: string;
  from: string;
  to: string;
  status: string;
}

/**
 * Панель инструментов ведомости заказов: поиск, тариф, менеджер и даты — одной строкой (значения применяются сразу, без
 * кнопки «Найти»), справа вид «Список / Производство»; ниже — чипы статусов с числами и быстрый период. На телефоне
 * поле поиска и кнопка фильтров в одной строке, чипы — лентой.
 */
export function OrdersToolbar({
  values,
  plans,
  admins,
  chips,
  periods,
  narrowed,
  resetHref,
}: {
  values: ToolbarValues;
  plans: { id: string; label: string }[];
  admins: { id: string; label: string }[];
  chips: StatusChip[];
  periods: SegmentItem[];
  narrowed: boolean;
  resetHref: string;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const go = (el: HTMLFormElement) => {
    const q = new URLSearchParams();
    for (const [k, v] of new FormData(el)) if (typeof v === "string" && v.trim()) q.set(k, v.trim());
    router.push(`/admin/orders${q.size ? `?${q}` : ""}`);
  };
  return (
    <div className="flex flex-col gap-3 lg:gap-0">
      <form
        ref={form}
        role="search"
        aria-label="Фильтры заказов"
        className="flex flex-wrap items-center gap-2 lg:border-b lg:border-line lg:p-3"
        onSubmit={(e) => {
          e.preventDefault();
          go(e.currentTarget);
        }}
        onChange={(e) => {
          if ((e.target as HTMLElement).matches("select, input[type=date]")) form.current?.requestSubmit();
        }}
      >
        {values.status ? <input type="hidden" name="status" value={values.status} /> : null}
        <div className="relative min-w-0 flex-1 lg:w-72 lg:max-w-sm lg:flex-none">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input name="q" type="search" defaultValue={values.q} placeholder="№, имя, телефон, город" aria-label="Поиск заказов: номер, имя, телефон, e-mail, город" className="input pl-9" />
        </div>
        <MobileFilters compact active={narrowed}>
          <select name="plan" defaultValue={values.plan} className="input lg:w-40" aria-label="Тариф">
            <option value="">Все тарифы</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <select name="assignee" defaultValue={values.assignee} className="input lg:w-44" aria-label="Менеджер">
            <option value="">Любой менеджер</option>
            <option value="me">Мои</option>
            <option value="none">Без ответственного</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1.5 max-lg:mt-2">
            <input type="date" name="from" defaultValue={values.from} className="input min-w-0 lg:w-36" aria-label="Заказы с даты" title="С даты" />
            <span className="text-muted" aria-hidden>
              –
            </span>
            <input type="date" name="to" defaultValue={values.to} className="input min-w-0 lg:w-36" aria-label="Заказы по дату" title="По дату" />
          </div>
        </MobileFilters>
        {narrowed ? (
          <Link href={resetHref} className="btn btn-ghost btn-sm max-lg:hidden">
            Сбросить
          </Link>
        ) : null}
        <OrdersViews active="list" className="ml-auto max-lg:hidden" />
        <button type="submit" className="sr-only">
          Найти
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 lg:border-b lg:border-line lg:px-3 lg:py-2.5">
        <nav aria-label="Статус заказа" className="m-hscroll flex min-w-0 flex-1 flex-wrap items-center gap-1.5 max-lg:w-full" data-no-ptr>
          {chips.map((c) => (
            <Link key={c.key || "all"} href={c.href} aria-current={c.active ? "page" : undefined} className={cn("chip max-lg:h-10", c.active && "chip-on")}>
              {c.dot ? <span className={cn("size-1.5 rounded-full", c.active ? "bg-current" : c.dot)} aria-hidden /> : null}
              {c.label}
              <span className={cn("text-xs tabular-nums", c.active ? "opacity-75" : "text-muted")}>{c.count}</span>
            </Link>
          ))}
        </nav>
        <Segmented label="Период заказов" items={periods} className="max-lg:hidden" />
      </div>
    </div>
  );
}
