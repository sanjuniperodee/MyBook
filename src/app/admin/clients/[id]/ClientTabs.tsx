"use client";

import { useState } from "react";
import { cn } from "@/lib/class-names";

export interface ClientTab {
  key: string;
  label: string;
  /** Сколько записей (или открытых задач). */
  count?: number | null;
  node: React.ReactNode;
}

/**
 * Вкладки клиента под профилем (DESIGN.md §7.2, «Разворот»): «Сделки / Задачи / Книги / Заказы / Платежи / Кабинет» одним
 * листом. Все вкладки отрисованы сразу и только прячутся — формы не теряют набранное при переключении.
 */
export function ClientTabs({ tabs, initial }: { tabs: ClientTab[]; initial?: string }) {
  const [active, setActive] = useState(tabs.some((t) => t.key === initial) ? initial! : tabs[0].key);
  return (
    <section className="panel overflow-hidden">
      <div className="tabs m-hscroll px-2" role="tablist" aria-label="Разделы клиента">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={active === t.key} aria-controls={`client-tab-${t.key}`} onClick={() => setActive(t.key)} className="tab max-lg:h-11 max-lg:text-sm">
            {t.label}
            {t.count ? <span className="count">{t.count}</span> : null}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} id={`client-tab-${t.key}`} role="tabpanel" aria-label={t.label} className={cn(active !== t.key && "hidden")}>
          {t.node}
        </div>
      ))}
    </section>
  );
}
