"use client";

import { useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { Actions, Field, Group, Note, Section } from "../ui";
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
  const off = props.dailyLimit === 0;
  return (
    <Section
      id="rule-sending"
      defaultOpen={false}
      title="Сообщения от правил: окно и лимит"
      description="Когда автоматизации пишут клиентам первыми и сколько сообщений в сутки"
      status={off ? { tone: "off", label: "правила первыми не пишут" } : { tone: "ok", label: `${props.from}–${props.to}, до ${props.dailyLimit} в сутки` }}
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Note>
          Номер WhatsApp один — ночные и массовые автоматические сообщения ведут к жалобам и блокировке. Правила автоматизаций пишут клиентам первыми только в это время (Алматы) и не больше лимита в сутки; «забросил книгу», годовщина и праздник вне окна и сверх лимита сработают позже, остальные правила срабатывают сразу (уведомления и задачи), а сообщение пропускают с заметкой в сделке. Автоответ на сообщение клиента уходит в любое время. 0 — правила первыми не пишут.
        </Note>
        <Group title="Окно отправки" hint="Время по Алматы: вне окна сообщения правил ждут утра.">
          <div className="flex flex-wrap gap-3">
            <Field label="С" className="w-32">
              <input type="time" className="input" value={from} onChange={(e) => setFrom(e.target.value)} required />
            </Field>
            <Field label="До" className="w-32">
              <input type="time" className="input" value={to} onChange={(e) => setTo(e.target.value)} required />
            </Field>
          </div>
        </Group>
        <Group title="Лимит" hint="Защита номера от блокировки.">
          <Field label="Сообщений в сутки" className="w-40">
            <input type="number" inputMode="numeric" min={0} max={props.max} step={1} className="input" value={limit} onChange={(e) => setLimit(e.target.value)} required />
          </Field>
          <p className="text-xs text-muted" data-testid="rule-sending-today">
            Сегодня ушло: {props.sentToday} из {props.dailyLimit}
          </p>
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
