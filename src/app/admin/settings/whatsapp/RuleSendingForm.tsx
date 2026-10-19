"use client";

import { useState, useTransition } from "react";
import { toast } from "@/components/ui/overlays";
import { Section } from "../ui";
import { saveRuleSendingAction } from "./actions";

/**
 * Защита номера WhatsApp (automation-15): когда правила автоматизаций пишут клиентам первыми и сколько сообщений в
 * сутки. Вне окна и сверх лимита сообщение правила не уходит («забросил книгу», годовщина и праздник сработают позже,
 * остальные — сразу, без сообщения), автоответ на сообщение клиента — уходит всегда.
 */
export function RuleSendingForm(props: { from: string; to: string; dailyLimit: number; sentToday: number; max: number }) {
  const [pending, start] = useTransition();
  const [from, setFrom] = useState(props.from);
  const [to, setTo] = useState(props.to);
  const [limit, setLimit] = useState(String(props.dailyLimit));
  const save = () =>
    start(async () => {
      const r = await saveRuleSendingAction({ from, to, dailyLimit: Number(limit) });
      toast(r.ok ? "Сохранено" : r.error, r.ok ? "success" : "error");
    });
  return (
    <Section title="Сообщения от правил: окно и лимит">
      <p className="mb-4 text-sm text-muted">
        Номер WhatsApp один — ночные и массовые автоматические сообщения ведут к жалобам и блокировке. Правила автоматизаций пишут клиентам первыми только в это время (Алматы) и не больше лимита в сутки; «забросил книгу», годовщина и праздник вне окна и сверх лимита сработают позже, остальные правила срабатывают сразу (уведомления и задачи), а сообщение пропускают с заметкой в сделке. Автоответ на сообщение клиента уходит в любое время. 0 — правила первыми не пишут.
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="block">
          <span className="mb-1 block text-xs text-muted">С</span>
          <input type="time" className="input h-10 w-28 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Окно: с" required />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">До</span>
          <input type="time" className="input h-10 w-28 text-sm" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Окно: до" required />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Сообщений в сутки</span>
          <input type="number" inputMode="numeric" min={0} max={props.max} step={1} className="input h-10 w-28 text-sm" value={limit} onChange={(e) => setLimit(e.target.value)} aria-label="Сообщений в сутки" required />
        </label>
        <button className="btn btn-primary btn-sm h-10" disabled={pending}>
          Сохранить
        </button>
        <span className="text-xs text-muted" data-testid="rule-sending-today">
          Сегодня ушло: {props.sentToday} из {props.dailyLimit}
        </span>
      </form>
    </Section>
  );
}
