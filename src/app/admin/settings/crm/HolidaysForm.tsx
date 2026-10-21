"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { Intro } from "@/components/admin/Intro";
import { Section } from "../ui";
import { saveHolidaysAction } from "./actions";

interface Row {
  id: string;
  /** ДД.ММ */
  day: string;
  ru: string;
  kk: string;
}

const dayOf = (date: string) => `${date.slice(3, 5)}.${date.slice(0, 2)}`;

/**
 * Праздники для повторных продаж (bots-10): правило «Приближается праздник» за N дней до каждого берёт тех, кто покупал
 * к нему в прошлом году, — сделка «Повторная продажа», готовый текст на языке клиента и задача менеджеру.
 */
export function HolidaysForm({ holidays, defaults, max }: { holidays: { id: string; date: string; ru: string; kk: string }[]; defaults: { id: string; date: string; ru: string; kk: string }[]; max: number }) {
  const toRows = (list: typeof holidays) => list.map((h) => ({ id: h.id, day: dayOf(h.date), ru: h.ru, kk: h.kk }));
  const [rows, setRows] = useState<Row[]>(toRows(holidays));
  const [pending, start] = useTransition();
  const set = (i: number, patch: Partial<Row>) => setRows((l) => l.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const save = () =>
    start(async () => {
      const r = await saveHolidaysAction(rows);
      toast(r.ok ? "Сохранено" : r.error, r.ok ? "success" : "error");
    });
  return (
    <Section defaultOpen={false} title="Праздники для повторных продаж">
      <Intro className="mb-4">
        Правило «Приближается праздник» (раздел «Автоматизации») за N дней до праздника берёт клиентов, которые покупали к нему в прошлом году: создаёт сделку «Повторная продажа», кладёт в неё готовый текст на языке клиента и ставит задачу менеджеру. Клиенту CRM сама не пишет. Название на русском видят сотрудники и клиенты с русским языком, на казахском — клиенты с казахским.
      </Intro>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2" data-testid="holiday">
            <input value={r.day} onChange={(e) => set(i, { day: e.target.value })} placeholder="31.12" maxLength={5} inputMode="decimal" className="input h-9 w-20 text-sm" aria-label="День и месяц" required />
            <input value={r.ru} onChange={(e) => set(i, { ru: e.target.value })} placeholder="Новый год" maxLength={60} className="input h-9 min-w-40 flex-1 text-sm" aria-label="Название на русском" required />
            <input value={r.kk} onChange={(e) => set(i, { kk: e.target.value })} placeholder="Жаңа жыл" maxLength={60} className="input h-9 min-w-40 flex-1 text-sm" aria-label="Название на казахском" required />
            <button type="button" className="text-muted hover:text-red-700" onClick={() => setRows((l) => l.filter((_, j) => j !== i))} aria-label="Убрать праздник">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        {rows.length === 0 ? <p className="text-sm text-muted">Праздников нет — правило «Приближается праздник» не сработает.</p> : null}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {rows.length < max ? (
            <button type="button" className="flex items-center gap-1.5 text-sm text-wine hover:underline" onClick={() => setRows((l) => [...l, { id: "", day: "", ru: "", kk: "" }])}>
              <Plus className="size-4" /> Праздник
            </button>
          ) : null}
          <button type="button" className="text-sm text-muted hover:underline" onClick={() => setRows(toRows(defaults))}>
            Праздники РК по умолчанию
          </button>
          <button className="btn btn-primary btn-sm ml-auto h-9" disabled={pending}>
            Сохранить
          </button>
        </div>
      </form>
    </Section>
  );
}
