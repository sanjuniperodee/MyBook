"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { addSpendAction, removeSpendAction } from "./actions";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** «Добавить расход» на рекламу (analytics-7): канал, день, сумма; последние записи — с удалением. */
export function SpendForm({ channels, recent }: { channels: { key: string; label: string }[]; recent: { id: string; label: string }[] }) {
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
    <section className="rounded-2xl border border-line bg-white p-5" data-testid="spend-form">
      <h2 className="mb-1 font-semibold">Расходы на рекламу</h2>
      <p className="mb-3 text-xs text-muted">Сколько потратили на канал — по ним в отчёте выше считаются расход, стоимость заявки и ROMI за выбранный период.</p>
      <div className="flex flex-wrap items-end gap-2">
        <select className="input h-10 w-48 text-sm" value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Канал">
          {channels.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <input type="date" className="input h-10 w-40 text-sm" value={day} onChange={(e) => setDay(e.target.value)} aria-label="День" />
        <input type="number" inputMode="numeric" min={1} className="input h-10 w-36 text-sm" placeholder="Сумма, ₸" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Сумма" />
        <input className="input h-10 min-w-40 flex-1 text-sm" placeholder="Заметка: блогер, кампания" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />
        <button type="button" className="btn btn-primary btn-sm h-10" disabled={pending || !amount} onClick={add}>
          Добавить расход
        </button>
      </div>
      {recent.length ? (
        <ul className="mt-3 divide-y divide-line text-sm">
          {recent.map((r) => (
            <li key={r.id} className="flex items-center gap-2 py-1.5">
              <span className="flex-1 text-ink-soft">{r.label}</span>
              <button
                type="button"
                className="rounded p-1 text-muted hover:text-red-700"
                aria-label="Удалить расход"
                onClick={() =>
                  start(async () => {
                    await removeSpendAction(r.id);
                    router.refresh();
                  })
                }
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
