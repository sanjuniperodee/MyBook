"use client";

import { useActionState } from "react";
import { Actions, CopyField, Field, Group, Help, Result, SaveButton, Section, SecretInput, type SheetStatus } from "../ui";
import type { SettingsState } from "../state";
import { saveGoogleAction } from "./actions";

/** Google Календарь для досок задач: OAuth-клиент Google Cloud и пошаговая инструкция. */
export function GoogleForm({ clientId, clientIdEnv, secret, secretEnv, redirectUri, origin, connected }: { clientId: string; clientIdEnv: boolean; secret: string; secretEnv: boolean; redirectUri: string; origin: string; connected: number }) {
  const [state, action] = useActionState<SettingsState, FormData>(saveGoogleAction, {});
  const ready = !!(clientId || clientIdEnv) && !!(secret || secretEnv);
  const status: SheetStatus = ready ? { tone: "ok", label: connected ? `подключили: ${connected}` : "ключи введены" } : { tone: "off", label: "не настроен" };
  return (
    <Section id="google" title="Google Календарь" description="Задачи сотрудников в их Google Календаре: двусторонняя синхронизация, встречи с Google Meet" status={status}>
      <form action={action} className="space-y-5">
        <Help open={!ready}>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              Откройте{" "}
              <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer" className="text-wine underline">
                console.cloud.google.com
              </a>{" "}
              под аккаунтом магазина и создайте проект «MyBooks CRM».
            </li>
            <li>
              «APIs &amp; Services» → «Library» → найдите <b>Google Calendar API</b> → «Enable».
            </li>
            <li>
              «Google Auth Platform» (или «OAuth consent screen») → «Get started»: имя приложения «MyBooks CRM», почта поддержки, аудитория <b>External</b>, контактная почта → «Create».
            </li>
            <li>
              «Branding»: домашняя страница https://mybooks.kz, политика конфиденциальности https://mybooks.kz/privacy, в «Authorized domains» — <b>mybooks.kz</b>.
            </li>
            <li>
              «Data access» → «Add or remove scopes»: отметьте <b>openid</b>, <b>…/auth/userinfo.email</b> и вставьте вручную <b>https://www.googleapis.com/auth/calendar.app.created</b> → «Update» → «Save».
            </li>
            <li>
              «Audience»: пока приложение в режиме «Testing», добавьте в «Test users» почты Google сотрудников (до 100). Чтобы подключался любой без списка — «Publish app» (Google попросит подтвердить приложение: обычно 3–5 рабочих дней; до подтверждения при входе будет предупреждение «Google не проверил это приложение» → «Продолжить»).
            </li>
            <li>
              «Clients» → «Create client» → тип <b>Web application</b>, имя «MyBooks CRM». «Authorized JavaScript origins» — адрес ниже, «Authorized redirect URIs» — адрес ниже. «Create» → скопируйте Client ID и Client secret сюда.
            </li>
          </ol>
        </Help>
        <Group title="Адреса для Google Cloud" hint="Вставьте их в настройки клиента OAuth как есть.">
          <CopyField label="Authorized JavaScript origins" value={origin} />
          <CopyField label="Authorized redirect URIs" value={redirectUri} />
        </Group>
        <Group title="Ключи клиента OAuth" hint="Client secret хранится зашифрованным.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Client ID">
              <input name="clientId" defaultValue={clientId} disabled={clientIdEnv} placeholder="1234567890-abc.apps.googleusercontent.com" className="input" autoComplete="off" />
            </Field>
            <SecretInput name="clientSecret" label="Client secret" saved={secret} fromEnv={secretEnv} />
          </div>
        </Group>
        <p className="text-xs text-muted">Сотрудник подключает свой календарь сам: «Задачи → Календарь → Подключить Google Календарь». В Google попадают только название задачи и ссылка на карточку — без телефонов и переписки клиента.</p>
        <Actions>
          <SaveButton />
          <Result state={state} />
        </Actions>
      </form>
    </Section>
  );
}
