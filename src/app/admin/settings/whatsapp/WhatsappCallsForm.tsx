"use client";

import { useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { Intro } from "@/components/admin/Intro";
import { cn } from "@/lib/class-names";
import { Section } from "../ui";
import { saveWhatsappCallsAction } from "./actions";

/**
 * Звонки WhatsApp из CRM: сотрудники звонят клиентам и отвечают на входящие в браузере, через номер магазина в своём шлюзе.
 * Бета: нужен шлюз со звонками и прокси звука в nginx — без них включить не даём (проверка шлюза при сохранении).
 */
export function WhatsappCallsForm(props: { enabled: boolean; gowa: boolean }) {
  const [pending, start] = useTransition();
  const [enabled, setEnabled] = useState(props.enabled);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const save = (next: boolean) =>
    start(async () => {
      const r = await saveWhatsappCallsAction(next);
      if (!r.ok) return setMessage({ ok: false, text: r.error });
      setEnabled(next);
      setMessage(r.warning ? { ok: false, text: r.warning } : { ok: true, text: next ? "Звонки WhatsApp включены — кнопка «WhatsApp» появилась рядом с «Позвонить»" : "Звонки WhatsApp выключены" });
    });
  return (
    <Section
      defaultOpen={false}
      title="Звонки WhatsApp из CRM"
      badge={<span className={cn("rounded-full px-2.5 py-0.5 text-xs", enabled ? "bg-emerald-100 text-emerald-800" : "bg-cream text-muted")}>{enabled ? "включены · бета" : "выключены"}</span>}
    >
      <Intro>
        Менеджер звонит клиенту в WhatsApp кнопкой «WhatsApp» рядом с «Позвонить» и отвечает на входящие звонки WhatsApp прямо в CRM — с номера магазина, через микрофон и динамик компьютера или телефона. Звонки попадают в «Звонки», ленту клиента и сделки, как звонки АТС; пропущенные — в уведомления и правила.
      </Intro>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">
        <li>Бета: звонки идут по неофициальному протоколу WhatsApp Web. WhatsApp может изменить его (звонки перестанут работать до обновления шлюза) или ограничить номер — не звоните массово незнакомым номерам.</li>
        <li>Нужен свой шлюз GOWA со звонками (сборка deploy/gowa-beta-build.sh) и прокси звука /wa-call/audio в nginx (deploy/wa-calls-nginx.sh).</li>
        <li>Пока звонки включены, входящий звонок WhatsApp звонит в CRM, а не на телефоне магазина.</li>
        <li>Лучше в наушниках: так собеседник не слышит эхо. Браузер спросит доступ к микрофону при первом звонке.</li>
      </ul>
      {!props.gowa ? <p className="mt-3 text-xs text-amber-800">Сначала выберите «Свой шлюз GOWA» выше — через Wazzup звонков нет.</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className={cn("btn btn-sm", enabled ? "btn-outline" : "btn-primary")} disabled={pending || (!enabled && !props.gowa)} onClick={() => save(!enabled)} data-testid="wa-calls-toggle">
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : null} {enabled ? "Выключить звонки" : "Включить звонки"}
        </button>
        {message ? <p className={cn("text-xs", message.ok ? "text-emerald-700" : "text-red-700")}>{message.text}</p> : null}
      </div>
    </Section>
  );
}
