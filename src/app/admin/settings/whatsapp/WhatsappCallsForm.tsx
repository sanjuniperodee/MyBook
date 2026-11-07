"use client";

import { useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/class-names";
import { CheckMessage, Group, Note, Section } from "../ui";
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
      id="wa-calls"
      defaultOpen={false}
      title="Звонки WhatsApp из CRM"
      description="Менеджер звонит клиенту и отвечает на входящие прямо в CRM, с номера магазина"
      status={enabled ? { tone: "ok", label: "включены · бета" } : { tone: "off", label: "выключены" }}
      actions={
        <button className={cn("btn btn-sm", enabled ? "btn-outline" : "btn-dark")} disabled={pending || (!enabled && !props.gowa)} onClick={() => save(!enabled)} data-testid="wa-calls-toggle">
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : null} {enabled ? "Выключить звонки" : "Включить звонки"}
        </button>
      }
    >
      <CheckMessage check={message ? { ok: message.ok, message: message.text } : null} />
      <div className="space-y-5">
        {!props.gowa ? <p className="max-w-[40rem] rounded-[var(--r-ctl)] bg-warning-bg px-3 py-2 text-sm text-warning">Сначала выберите «Свой шлюз GOWA» в листе выше: через Wazzup звонков нет.</p> : null}
        <Note>
          Менеджер звонит клиенту в WhatsApp кнопкой «WhatsApp» рядом с «Позвонить» и отвечает на входящие звонки WhatsApp прямо в CRM — с номера магазина, через микрофон и динамик компьютера или телефона. Звонки попадают в «Звонки», ленту клиента и сделки, как звонки АТС; пропущенные — в уведомления и правила.
        </Note>
        <Group title="Что нужно знать" hint="Это бета: прочитайте перед включением.">
          <ul className="list-disc space-y-1.5 pl-5 text-[13px] text-ink-soft">
            <li>Звонки идут по неофициальному протоколу WhatsApp Web. WhatsApp может изменить его (звонки перестанут работать до обновления шлюза) или ограничить номер — не звоните массово незнакомым номерам.</li>
            <li>Нужен свой шлюз GOWA со звонками (сборка deploy/gowa-beta-build.sh) и прокси звука /wa-call/audio в nginx (deploy/wa-calls-nginx.sh).</li>
            <li>Пока звонки включены, входящий звонок WhatsApp звонит в CRM, а не на телефоне магазина.</li>
            <li>Разговоры записываются; слушать записи в «Звонках» может только сотрудник с правом «Слушать записи разговоров» — по умолчанию руководитель.</li>
            <li>Лучше в наушниках: так собеседник не слышит эхо. Браузер спросит доступ к микрофону при первом звонке.</li>
          </ul>
        </Group>
      </div>
    </Section>
  );
}
