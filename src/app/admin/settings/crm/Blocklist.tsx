"use client";

import { useTransition } from "react";
import { Section } from "../ui";
import { unblockAction } from "../../deals/actions";

export function Blocklist({ items }: { items: { value: string; label: string; date: string }[] }) {
  const [pending, start] = useTransition();
  return (
    <Section title="Спам">
      {items.length === 0 ? <p className="text-sm text-muted">Номеров в спаме нет. Отметить заявку как спам можно в «Неразобранном».</p> : null}
      <div className="divide-y divide-line">
        {items.map((i) => (
          <div key={i.value} className="flex items-center gap-3 py-2 text-sm">
            <span className="flex-1 tabular-nums">{i.label}</span>
            <span className="text-xs text-muted">{i.date}</span>
            <button className="text-xs text-wine hover:underline" disabled={pending} onClick={() => start(() => unblockAction(i.value))}>
              Убрать из спама
            </button>
          </div>
        ))}
      </div>
    </Section>
  );
}
