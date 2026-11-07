"use client";

import { useState, useTransition } from "react";
import { completeTaskAction } from "@/app/admin/actions";
import { toast } from "@/components/ui/overlays";

const CHIPS: Record<string, string[]> = {
  call: ["Дозвонился", "Не ответил", "Перезвонить позже", "Договорились"],
  message: ["Написал", "Клиент ответил", "Клиент думает", "Отказ"],
  default: ["Сделано", "Договорились", "Клиент думает", "Отказ"],
};
const NEXT: [string, number][] = [
  ["Завтра", 1],
  ["Через 3 дня", 3],
  ["Через неделю", 7],
];

/** Дата через n дней по часам сотрудника: «ГГГГ-ММ-ДД» (срок задачи сервер читает в поясе магазина). */
const dayAfter = (n: number) => {
  const d = new Date(Date.now() + n * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * «Что сделали?» при отметке задачи (tasks-1): итог — кнопкой или словами, необязательно; «следующий шаг» — новая задача
 * на того же клиента. Итог уходит заметкой в ленту сделки. «Без итога» — просто отметить.
 */
export function CompleteTask({ taskId, kind, onClose }: { taskId: string; kind: string; onClose: (done: boolean) => void }) {
  const [result, setResult] = useState("");
  const [next, setNext] = useState("");
  const [due, setDue] = useState(1);
  const [pending, start] = useTransition();
  const finish = (withResult: boolean) =>
    start(async () => {
      const r = await completeTaskAction(taskId, withResult ? { result: result.trim() || undefined, nextTitle: next.trim() || undefined, nextDue: next.trim() ? dayAfter(due) : undefined } : {});
      if (r.error) return toast(r.error, "error");
      onClose(true);
    });
  return (
    <div className="mt-1 w-full space-y-2.5 rounded-[10px] border border-line bg-sunken/60 p-3 text-sm" data-testid="complete-task">
      <div className="text-sm font-medium">Что сделали?</div>
      <div className="flex flex-wrap gap-1.5">
        {(CHIPS[kind] ?? CHIPS.default).map((c) => (
          <button key={c} type="button" aria-pressed={result === c} className="chip h-8 px-2.5 text-xs max-lg:h-10" onClick={() => setResult(result === c ? "" : c)}>
            {c}
          </button>
        ))}
      </div>
      <input className="input h-10 w-full text-sm" aria-label="Итог" placeholder="Итог своими словами (необязательно)" value={result} onChange={(e) => setResult(e.target.value)} maxLength={500} />
      <div className="flex flex-wrap items-center gap-2">
        <input className="input h-10 min-w-0 flex-1 basis-48 text-sm" aria-label="Следующий шаг" placeholder="Следующий шаг (необязательно)" value={next} onChange={(e) => setNext(e.target.value)} maxLength={300} />
        <select className="input h-10 w-auto text-sm" value={due} onChange={(e) => setDue(Number(e.target.value))} disabled={!next.trim()} aria-label="Срок следующего шага">
          {NEXT.map(([label, n]) => (
            <option key={n} value={n}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-dark btn-sm" disabled={pending} onClick={() => finish(true)}>
          Готово
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => finish(false)}>
          Без итога
        </button>
        <button type="button" className="btn btn-ghost btn-sm text-muted" disabled={pending} onClick={() => onClose(false)}>
          Отмена
        </button>
      </div>
    </div>
  );
}
