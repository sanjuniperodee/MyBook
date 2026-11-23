"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { Field } from "@/components/ui/Field";
import { saveStageOrderAction } from "../actions";

interface Value {
  on: boolean;
  workStageId: string;
  silentStageId: string;
  paidStageId: string;
  silentDays: number;
  lostDays: number;
}

/**
 * «Порядок в воронке»: сделки сами идут по этапам. Оплата — на этап оплаченных; ответили на новую заявку — «в работе»;
 * клиент молчит — «не отвечает», потом отказ; написал снова — обратно «в работе». Когда клиент замолчал, переписку читает
 * ИИ-помощник: ясный отказ уходит в «Отказ» сразу, с причиной, а в ленту сделки ложится короткий вывод.
 */
export function StageOrderPanel({ stages, value, ai }: { stages: { id: string; name: string }[]; value: Value; ai: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [v, setV] = useState(value);
  const set = (patch: Partial<Value>) => setV((cur) => ({ ...cur, ...patch }));
  const save = () =>
    start(async () => {
      const r = await saveStageOrderAction(v);
      if (r.error) return toast(r.error, "error");
      toast(v.on ? "Порядок в воронке включён" : "Сохранено", "success");
      router.refresh();
    });
  const stageSelect = (key: "workStageId" | "silentStageId" | "paidStageId", empty: string) => (
    <select className="input" value={v[key]} onChange={(e) => set({ [key]: e.target.value })}>
      <option value="">{empty}</option>
      {stages.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
  return (
    <form
      className="space-y-4"
      data-testid="stage-order"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-wine)]" checked={v.on} onChange={(e) => set({ on: e.target.checked })} />
        <span>
          <span className="font-medium">Двигать сделки по этапам автоматически</span>
          <span className="block text-muted">Сделки с открытой задачей и с оформленным заказом не трогаются. Заявка, на которую ещё не ответили, остаётся на первом этапе.</span>
        </span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ответили клиенту или он написал снова" hint="Этап «в работе»">
          {stageSelect("workStageId", "— выберите этап —")}
        </Field>
        <Field label="Клиент не отвечает" hint="Этап «не отвечает»">
          {stageSelect("silentStageId", "— выберите этап —")}
        </Field>
        <Field label="Дней молчания до «не отвечает»">
          <input type="number" inputMode="numeric" min={1} max={30} className="input tabular-nums" value={v.silentDays} onChange={(e) => set({ silentDays: Number(e.target.value) })} />
        </Field>
        <Field label="Дней молчания до отказа" hint="Причина — «Не отвечает»; сделку с датой события впереди — не раньше этой даты">
          <input type="number" inputMode="numeric" min={2} max={90} className="input tabular-nums" value={v.lostDays} onChange={(e) => set({ lostDays: Number(e.target.value) })} />
        </Field>
        <Field label="По сделке пришла оплата" hint="Предоплата при заведении клиента, платёж или счёт" className="sm:col-span-2">
          {stageSelect("paidStageId", "не двигать")}
        </Field>
      </div>
      <p className="text-xs text-muted">
        {ai
          ? "Когда клиент замолчал, переписку один раз читает ИИ-помощник: отказ уходит в «Отказ» с причиной (дорого, передумал, не успеваем к дате, выбрал другой подарок), вывод — в ленту сделки."
          : "ИИ-помощник не подключён («Интеграции» → AI): причину отказа по переписке определить некому, замолчавшие заявки уходят в «не отвечает» без вывода."}
      </p>
      <button type="submit" className="btn btn-dark" disabled={pending}>
        {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null} Сохранить
      </button>
    </form>
  );
}
