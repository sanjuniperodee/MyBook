"use client";

import { useActionState, useState, useTransition } from "react";
import { LoaderCircle, PlugZap } from "lucide-react";
import { Actions, CheckMessage, CopyField, Field, Group, Help, Result, SaveButton, Section, SecretInput, rotateToken } from "../ui";
import type { SettingsState } from "../state";
import { saveWazzupAction, testWazzupAction, registerWazzupWebhookAction } from "./actions";

export function WazzupForm({ saved, env, webhookUrl }: { saved: { apiKey: string; baseUrl: string; channelId: string }; env: { apiKey: boolean; baseUrl: boolean; channelId: boolean }; webhookUrl: string | null }) {
  const [state, action] = useActionState<SettingsState, FormData>(saveWazzupAction, {});
  const [channels, setChannels] = useState<{ id: string; label: string; state: string }[] | null>(null);
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const connected = !!saved.apiKey || env.apiKey;
  return (
    <Section
      id="wazzup"
      defaultOpen={false}
      title="Wazzup: WhatsApp, Instagram, Telegram"
      description="Сторонний сервис для переписки в мессенджерах; Instagram и Telegram идут только через него"
      status={connected ? { tone: "ok", label: "ключ сохранён" } : { tone: "off", label: "не подключено" }}
      actions={
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={pending || !connected}
          onClick={() =>
            start(async () => {
              const r = await testWazzupAction();
              setCheck(r);
              if (r.channels) setChannels(r.channels);
            })
          }
        >
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <PlugZap className="size-4" aria-hidden />} Проверить
        </button>
      }
    >
      <CheckMessage check={check} />
      <form action={action} className="space-y-5">
        <Help open={!connected}>
          <ol className="list-decimal space-y-1 pl-5">
            <li>В личном кабинете Wazzup откройте «Интеграции → API» и скопируйте ключ.</li>
            <li>Вставьте ключ ниже и сохраните, затем нажмите «Проверить» и выберите канал WhatsApp для исходящих.</li>
            <li>Нажмите «Подключить вебхук» — входящие сообщения начнут появляться в разделе «Чаты».</li>
          </ol>
        </Help>
        <Group title="Доступ" hint="Ключ шифруется в базе и не показывается целиком.">
          <SecretInput name="apiKey" label="API-ключ Wazzup" saved={saved.apiKey} fromEnv={env.apiKey} />
          <Field label="Адрес API" hint="Обычно не меняется.">
            <input name="baseUrl" defaultValue={saved.baseUrl} disabled={env.baseUrl} className="input" />
          </Field>
        </Group>
        <Group title="Исходящие" hint="Канал, с которого уходят первые сообщения клиентам.">
          <Field label="Канал для первых сообщений (channelId)">
            {channels?.length ? (
              <select name="channelId" defaultValue={saved.channelId} disabled={env.channelId} className="input">
                <option value="">— не выбран —</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} {c.state !== "active" ? `(${c.state})` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <input name="channelId" defaultValue={saved.channelId} disabled={env.channelId} placeholder="нажмите «Проверить», чтобы выбрать" className="input font-mono text-xs" />
            )}
          </Field>
        </Group>
        <Group title="Входящие" hint="Вебхук доставляет сообщения клиентов в «Чаты».">
          <div>
            <button type="button" className="btn btn-outline" disabled={pending || !connected} onClick={() => start(async () => setCheck(await registerWazzupWebhookAction()))}>
              Подключить вебхук
            </button>
          </div>
          {webhookUrl ? <CopyField label="Адрес вебхука (если подключаете вручную)" value={webhookUrl} onRotate={() => rotateToken("wazzup.webhookToken")} /> : null}
        </Group>
        <Actions>
          <SaveButton />
          <Result state={state} />
        </Actions>
      </form>
    </Section>
  );
}
