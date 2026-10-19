"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Section, Status, Result, CopyField, SecretInput, Choice, rotateToken } from "../ui";
import type { SettingsState } from "../state";
import { saveTelephonyAction } from "./actions";

export function TelephonyForm({
  provider,
  providerFromEnv,
  zadarma,
  zadarmaUrl,
  pbxUrl,
}: {
  provider: "off" | "zadarma" | "pbx";
  providerFromEnv: boolean;
  zadarma: { key: string; secret: string; keyEnv: boolean; secretEnv: boolean; pbxId: string; pbxIdEnv: boolean; webphone: boolean };
  zadarmaUrl: string;
  pbxUrl: string | null;
}) {
  const [state, action] = useActionState<SettingsState, FormData>(saveTelephonyAction, {});
  const [p, setP] = useState(provider);
  return (
    <Section title="Телефония" badge={<Status on={provider !== "off"} label={provider === "off" ? "не подключена" : provider === "zadarma" ? "Zadarma" : "своя АТС"} />}>
      <form action={action} className="space-y-4">
        <div className="flex flex-wrap gap-2 text-sm">
          {(
            [
              ["off", "Выключена"],
              ["zadarma", "Zadarma"],
              ["pbx", "Другая АТС (вебхук)"],
            ] as const
          ).map(([v, label]) => (
            <Choice key={v} active={p === v}>
              <input type="radio" name="provider" value={v} checked={p === v} onChange={() => setP(v)} disabled={providerFromEnv} className="accent-wine" />
              {label}
            </Choice>
          ))}
        </div>
        {p === "zadarma" ? (
          <div className="space-y-3">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft">
              <li>В кабинете Zadarma: «Настройки → Интеграции и API» — скопируйте Key и Secret.</li>
              <li>Там же включите «Уведомления о звонках в АТС» и укажите адрес ниже. Отметьте события: начало и конец входящего, ответ, исходящие, запись.</li>
              <li>Внутренние номера сотрудников (100, 101…) укажите в разделе «Команда» — так звонки распределятся по менеджерам, а кнопка «Позвонить» заработает.</li>
            </ol>
            <div className="grid gap-3 sm:grid-cols-2">
              <SecretInput name="zadarmaKey" label="Key" saved={zadarma.key} fromEnv={zadarma.keyEnv} />
              <SecretInput name="zadarmaSecret" label="Secret" saved={zadarma.secret} fromEnv={zadarma.secretEnv} />
            </div>
            <CopyField label="Адрес для уведомлений Zadarma" value={zadarmaUrl} />
            <div className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-[180px_1fr] sm:items-end">
              <label className="block">
                <span className="mb-1 block text-xs text-muted">Номер АТС (для веб-телефона)</span>
                <input name="pbxId" defaultValue={zadarma.pbxId} disabled={zadarma.pbxIdEnv} placeholder="например, 12345" className="input h-10 text-sm" inputMode="numeric" />
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="webphone" defaultChecked={zadarma.webphone} className="mt-0.5 size-4 accent-wine" />
                <span>
                  Веб-телефон в CRM: звонки и входящие прямо в браузере, без софтфона
                  <span className="block text-xs text-muted">Номер АТС — в кабинете Zadarma, «Моя АТС» (SIP-логины вида 12345-100). В «Команде» у сотрудника должен быть указан внутренний номер.</span>
                </span>
              </label>
            </div>
          </div>
        ) : null}
        {p === "pbx" ? (
          <div className="space-y-3 text-sm text-ink-soft">
            <p>Любая АТС (Asterisk, FreePBX, Mango, Beeline и др. через их вебхуки) может присылать события звонков POST-запросом с JSON:</p>
            <pre className="overflow-x-auto rounded-xl bg-[#1f1b18] p-3 text-xs text-[#f3e9dc]">{`{
  "event": "start" | "answer" | "end" | "record",
  "callId": "уникальный id звонка",
  "direction": "in" | "out",
  "phone": "+77011234567",
  "extension": "101",
  "status": "answered" | "missed" | "busy" | "failed",
  "duration": 125,
  "recordingUrl": "https://…/record.mp3"
}`}</pre>
            {pbxUrl ? <CopyField label="Адрес вебхука (токен можно передать и заголовком X-Token)" value={pbxUrl} onRotate={() => rotateToken("pbx.token")} /> : <p className="text-xs">Сохраните настройку — адрес с токеном появится здесь.</p>}
          </div>
        ) : null}
        <div className="flex items-center gap-3">
          <SubmitButton className="btn-sm">Сохранить</SubmitButton>
          <Result state={state} />
        </div>
      </form>
    </Section>
  );
}
