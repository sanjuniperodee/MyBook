"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { Actions, Group, Note, Section } from "../ui";
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
    <Section
      id="holidays"
      defaultOpen={false}
      title="Праздники для повторных продаж"
      description="Правило «Приближается праздник» берёт тех, кто покупал к нему в прошлом году"
      status={rows.length ? { tone: "ok", label: `${rows.length} в списке` } : { tone: "off", label: "список пуст" }}
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Note>
          Правило «Приближается праздник» (раздел «Автоматизации») за N дней до праздника берёт клиентов, которые покупали к нему в прошлом году: создаёт сделку «Повторная продажа», кладёт в неё готовый текст на языке клиента и ставит задачу менеджеру. Клиенту CRM сама не пишет. Название на русском видят сотрудники и клиенты с русским языком, на казахском — клиенты с казахским.
        </Note>
        <Group title="Праздники" hint="День и месяц, название на русском и на казахском.">
          <div className="hidden grid-cols-[5rem_minmax(0,1fr)_minmax(0,1fr)_2.25rem] gap-2 text-xs text-muted sm:grid">
            <span>День</span>
            <span>По-русски</span>
            <span>По-казахски</span>
            <span />
          </div>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[5rem_minmax(0,1fr)_2.25rem] items-center gap-2 sm:grid-cols-[5rem_minmax(0,1fr)_minmax(0,1fr)_2.25rem]" data-testid="holiday">
                <input value={r.day} onChange={(e) => set(i, { day: e.target.value })} placeholder="31.12" maxLength={5} inputMode="decimal" className="input" aria-label="День и месяц" required />
                <input value={r.ru} onChange={(e) => set(i, { ru: e.target.value })} placeholder="Новый год" maxLength={60} className="input" aria-label="Название на русском" required />
                <input value={r.kk} onChange={(e) => set(i, { kk: e.target.value })} placeholder="Жаңа жыл" maxLength={60} className="input max-sm:col-span-2 max-sm:col-start-2 max-sm:row-start-2" aria-label="Название на казахском" required />
                <button type="button" className="btn btn-ghost btn-icon btn-sm text-muted hover:text-danger" onClick={() => setRows((l) => l.filter((_, j) => j !== i))} aria-label="Убрать праздник">
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
          {rows.length === 0 ? <p className="text-sm text-muted">Праздников нет — правило «Приближается праздник» не сработает.</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            {rows.length < max ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setRows((l) => [...l, { id: "", day: "", ru: "", kk: "" }])}>
                <Plus className="size-4" aria-hidden /> Добавить праздник
              </button>
            ) : null}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRows(toRows(defaults))}>
              Праздники РК по умолчанию
            </button>
          </div>
        </Group>
        <Actions>
          <button className="btn btn-dark" disabled={pending}>
            {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null} Сохранить
          </button>
        </Actions>
      </form>
    </Section>
  );
}
