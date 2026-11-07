"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { Field } from "@/components/ui/Field";
import { addSpendAction, removeSpendAction } from "./actions";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export interface SpendRow {
  id: string;
  day: string;
  channel: string;
  amount: string;
  note: string;
}

/** «Добавить расход» на рекламу (analytics-7): канал, день, сумма; последние записи — с удалением. Живёт в боковой панели. */
export function SpendForm({ channels, recent }: { channels: { key: string; label: string }[]; recent: SpendRow[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [channel, setChannel] = useState("instagram");
  const [day, setDay] = useState(today);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const add = () =>
    start(async () => {
      const r = await addSpendAction({ channel, day, amount, note });
      if (!r.ok) return toast(r.error, "error");
      setAmount("");
      setNote("");
      toast("Расход добавлен", "success");
      router.refresh();
    });
  return (
    <div className="space-y-5">
      <p className="text-xs text-muted">По расходам в отчёте считаются расход, стоимость заявки и ROMI за выбранный период.</p>
      <form
        className="grid grid-cols-2 gap-3"
        data-testid="spend-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (amount) add();
        }}
      >
        <Field label="Канал" className="col-span-2">
          <select className="input" value={channel} onChange={(e) => setChannel(e.target.value)}>
            {channels.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="День">
          <input type="date" className="input" value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>
        <Field label="Сумма, ₸">
          <input type="number" inputMode="numeric" min={1} className="input tabular-nums" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Заметка" optional className="col-span-2">
          <input className="input" placeholder="Блогер, кампания" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />
        </Field>
        <button type="submit" className="btn btn-dark col-span-2" disabled={pending || !amount}>
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" strokeWidth={1.8} aria-hidden />} Добавить расход
        </button>
      </form>
      {recent.length ? (
        <section aria-label="Последние расходы">
          <h3 className="mb-1 text-xs font-semibold text-ink-soft">Последние расходы</h3>
          <ul className="divide-y divide-line border-y border-line text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex min-h-11 items-center gap-3 py-1.5">
                <span className="w-12 shrink-0 text-muted tabular-nums">{r.day}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{r.channel}</span>
                  {r.note ? <span className="block truncate text-xs text-muted">{r.note}</span> : null}
                </span>
                <span className="shrink-0 font-medium tabular-nums">{r.amount}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon btn-sm text-muted hover:text-danger"
                  aria-label={`Удалить расход ${r.amount}`}
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      await removeSpendAction(r.id);
                      router.refresh();
                    })
                  }
                >
                  <Trash2 className="size-4" strokeWidth={1.8} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
