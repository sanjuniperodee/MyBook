"use client";

import { useActionState, useState, useTransition } from "react";
import { LoaderCircle, PlugZap } from "lucide-react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Section, Status, Result, CopyField, SecretInput, CheckMessage, rotateToken } from "../ui";
import type { SettingsState } from "../state";
import { saveWazzupAction, testWazzupAction, registerWazzupWebhookAction } from "./actions";

export function WazzupForm({ saved, env, webhookUrl }: { saved: { apiKey: string; baseUrl: string; channelId: string }; env: { apiKey: boolean; baseUrl: boolean; channelId: boolean }; webhookUrl: string | null }) {
  const [state, action] = useActionState<SettingsState, FormData>(saveWazzupAction, {});
  const [channels, setChannels] = useState<{ id: string; label: string; state: string }[] | null>(null);
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const connected = !!saved.apiKey || env.apiKey;
  return (
    <Section title="WhatsApp, Instagram, Telegram — Wazzup" badge={<Status on={connected} label={connected ? "ключ сохранён" : "не подключено"} />}>
      <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-ink-soft">
        <li>В личном кабинете Wazzup откройте «Интеграции → API» и скопируйте ключ.</li>
        <li>Вставьте ключ ниже и сохраните, затем нажмите «Проверить» и выберите канал WhatsApp для исходящих.</li>
        <li>Нажмите «Подключить вебхук» — входящие сообщения начнут появляться в разделе «Чаты».</li>
      </ol>
      <form action={action} className="space-y-3">
        <SecretInput name="apiKey" label="API-ключ Wazzup" saved={saved.apiKey} fromEnv={env.apiKey} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Канал для первых сообщений (channelId)</span>
            {channels?.length ? (
              <select name="channelId" defaultValue={saved.channelId} disabled={env.channelId} className="input h-10 text-sm">
                <option value="">— не выбран —</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} {c.state !== "active" ? `(${c.state})` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <input name="channelId" defaultValue={saved.channelId} disabled={env.channelId} placeholder="нажмите «Проверить», чтобы выбрать" className="input h-10 font-mono text-xs" />
            )}
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Адрес API (обычно не меняется)</span>
            <input name="baseUrl" defaultValue={saved.baseUrl} disabled={env.baseUrl} className="input h-10 text-sm" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton className="btn-sm">Сохранить</SubmitButton>
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
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : <PlugZap className="size-4" />} Проверить
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={pending || !connected}
            onClick={() => start(async () => setCheck(await registerWazzupWebhookAction()))}
          >
            Подключить вебхук
          </button>
          <Result state={state} />
        </div>
        <CheckMessage check={check} />
        {webhookUrl ? <CopyField label="Адрес вебхука (если подключаете вручную)" value={webhookUrl} onRotate={() => rotateToken("wazzup.webhookToken")} /> : null}
      </form>
    </Section>
  );
}
