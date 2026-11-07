"use client";

import { useActionState, useState } from "react";
import { Actions, Choice, CopyField, Field, Group, Help, Result, SaveButton, Section, SecretInput, Toggle, rotateToken, type SheetStatus } from "../ui";
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
  const keysReady = !!(zadarma.key || zadarma.keyEnv) && !!(zadarma.secret || zadarma.secretEnv);
  const status: SheetStatus =
    provider === "off" ? { tone: "off", label: "не подключена" } : provider === "zadarma" ? (keysReady ? { tone: "ok", label: "Zadarma" } : { tone: "warn", label: "Zadarma: не хватает ключей" }) : { tone: "ok", label: "своя АТС" };
  return (
    <Section id="telephony" title="Телефония" description="Журнал звонков, запись разговоров и кнопка «Позвонить» в CRM" status={status}>
      <form action={action} className="space-y-5">
        <Group title="Провайдер" hint="Кто присылает события звонков в CRM.">
          <div className="flex flex-wrap gap-2">
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
        </Group>
        {p === "zadarma" ? (
          <>
            <Help open={!keysReady}>
              <ol className="list-decimal space-y-1 pl-5">
                <li>В кабинете Zadarma: «Настройки → Интеграции и API» — скопируйте Key и Secret.</li>
                <li>Там же включите «Уведомления о звонках в АТС» и укажите адрес ниже. Отметьте события: начало и конец входящего, ответ, исходящие, запись.</li>
                <li>Внутренние номера сотрудников (100, 101…) укажите в разделе «Команда» — так звонки распределятся по менеджерам, а кнопка «Позвонить» заработает.</li>
              </ol>
            </Help>
            <Group title="Доступ к Zadarma" hint="Ключи из кабинета Zadarma шифруются в базе.">
              <div className="grid gap-4 sm:grid-cols-2">
                <SecretInput name="zadarmaKey" label="Key" saved={zadarma.key} fromEnv={zadarma.keyEnv} />
                <SecretInput name="zadarmaSecret" label="Secret" saved={zadarma.secret} fromEnv={zadarma.secretEnv} />
              </div>
              <CopyField label="Адрес для уведомлений Zadarma" value={zadarmaUrl} />
            </Group>
            <Group title="Веб-телефон в CRM" hint="Звонки и входящие прямо в браузере, без софтфона.">
              <Field label="Номер АТС (для веб-телефона)" hint="В кабинете Zadarma, «Моя АТС» (SIP-логины вида 12345-100). В «Команде» у сотрудника должен быть указан внутренний номер." className="w-56">
                <input name="pbxId" defaultValue={zadarma.pbxId} disabled={zadarma.pbxIdEnv} placeholder="например, 12345" className="input" inputMode="numeric" />
              </Field>
              <Toggle name="webphone" defaultChecked={zadarma.webphone} label="Включить веб-телефон" />
            </Group>
          </>
        ) : null}
        {p === "pbx" ? (
          <Group title="Вебхук вашей АТС" hint="Asterisk, FreePBX, Mango, Beeline и другие присылают события звонков POST-запросом с JSON.">
            <pre className="overflow-x-auto rounded-[var(--r-ctl)] bg-ink p-3 text-xs text-white">{`{
  "event": "start" | "answer" | "end" | "record",
  "callId": "уникальный id звонка",
  "direction": "in" | "out",
  "phone": "+77011234567",
  "extension": "101",
  "status": "answered" | "missed" | "busy" | "failed",
  "duration": 125,
  "recordingUrl": "https://…/record.mp3"
}`}</pre>
            {pbxUrl ? <CopyField label="Адрес вебхука (токен можно передать и заголовком X-Token)" value={pbxUrl} onRotate={() => rotateToken("pbx.token")} /> : <p className="text-xs text-muted">Сохраните настройку — адрес с токеном появится здесь.</p>}
          </Group>
        ) : null}
        {p === "off" ? <p className="max-w-[40rem] text-sm text-muted">Телефония выключена. Выберите провайдера и сохраните, чтобы звонки попадали в CRM.</p> : null}
        <Actions>
          <SaveButton />
          <Result state={state} />
        </Actions>
      </form>
    </Section>
  );
}
