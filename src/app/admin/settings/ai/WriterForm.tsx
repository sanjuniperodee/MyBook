"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckCircle2, LoaderCircle, PenLine } from "lucide-react";
import { aiProviderIds, aiProviders, type AiProvider } from "@/modules/assistant/domain/providers";
import { Actions, CheckMessage, Choice, Field, Group, Note, Result, SaveButton, Section, SecretInput, Toggle, type SheetStatus } from "../ui";
import type { SettingsState } from "../state";
import { saveWriterAction, testWriterAction } from "./actions";
import { providerReady, type AiProviderSaved } from "./saved";

/**
 * AI-помощник при письме у клиента: кнопки под полем ответа «Оформить», «Улучшить», «Короче», «Длиннее» и «Переписать по
 * просьбе». Свои провайдер, модель, флажок и лимиты — отдельно от корректора грамотности и от AI-помощника менеджеров.
 */
export function WriterForm({
  provider,
  proofreadProvider,
  model,
  enabled,
  perTenMin,
  perDay,
  providers,
}: {
  /** "" — как у корректора. */
  provider: AiProvider | "";
  /** Провайдер корректора (на него «как у корректора» и указывает). */
  proofreadProvider: AiProvider;
  model: string;
  enabled: boolean;
  perTenMin: string;
  perDay: string;
  providers: Record<AiProvider, AiProviderSaved>;
}) {
  const [state, action] = useActionState<SettingsState, FormData>(saveWriterAction, {});
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const [p, setP] = useState<AiProvider | "">(provider);
  const effective = p || proofreadProvider;
  const def = aiProviders[effective];
  const saved = providers[effective];
  const ready = (id: AiProvider) => providerReady(providers, id);
  const connected = ready(provider || proofreadProvider);
  const status: SheetStatus = !connected ? { tone: "off", label: "AI не подключён: кнопок у клиента нет" } : enabled ? { tone: "ok", label: `${aiProviders[provider || proofreadProvider].label} · включён` } : { tone: "off", label: "выключен" };
  return (
    <Section
      id="ai-writer"
      defaultOpen={false}
      title="AI-помощник при письме у клиента"
      description="Кнопки под полем ответа: «Оформить», «Улучшить», «Короче», «Длиннее», «Переписать по просьбе»"
      status={status}
      actions={
        <button type="button" className="btn btn-outline btn-sm" disabled={pending || !connected} onClick={() => start(async () => setCheck(await testWriterAction()))}>
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <PenLine className="size-4" aria-hidden />} Проверить
        </button>
      }
    >
      <CheckMessage check={check} wrap />
      <form action={action} className="space-y-5">
        <Note>
          Это не корректор грамотности (он выше) и не AI-помощник менеджеров в CRM. Модель можно взять дешёвую или бесплатную — тексты клиентов уходят только ей. Пока провайдер и модель пусты, помощник работает на корректоре, как было раньше. «Проверить» просит сохранённую модель улучшить короткий текст и показывает ответ.
        </Note>
        <Group title="Провайдер" hint="Галочка у названия — ключ уже сохранён.">
          <div className="flex flex-wrap gap-2">
            <Choice active={p === ""}>
              <input type="radio" name="provider" value="" checked={p === ""} onChange={() => setP("")} className="accent-wine" />
              Как у корректора ({aiProviders[proofreadProvider].label})
            </Choice>
            {aiProviderIds.map((id) => (
              <Choice key={id} active={p === id}>
                <input type="radio" name="provider" value={id} checked={p === id} onChange={() => setP(id)} className="accent-wine" />
                {aiProviders[id].title}
                {ready(id) ? <CheckCircle2 className="size-3.5 text-success" aria-label="ключ сохранён" /> : null}
              </Choice>
            ))}
          </div>
        </Group>
        <Group title="Ключ и модель">
          <div key={effective} className="space-y-4">
            <SecretInput name="key" label={`Ключ ${def.label} API`} saved={saved.apiKey} fromEnv={saved.apiKeyEnv} placeholder={def.keyPlaceholder} />
            <Field label="Модель помощника" hint={`Пусто — как у корректора, иначе ${saved.model || def.defaultModel || "модель провайдера"}.`}>
              <input name="model" defaultValue={model} placeholder={saved.model || def.defaultModel} className="input" maxLength={100} />
            </Field>
          </div>
        </Group>
        <Group title="Показ и лимиты" hint="Лимиты считаются на клиента.">
          <Toggle name="enabled" defaultChecked={enabled} label="Показывать клиентам кнопки помощника" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Запросов на клиента за 10 минут">
              <input name="perTenMin" type="number" inputMode="numeric" min={1} max={1000} defaultValue={perTenMin} className="input" />
            </Field>
            <Field label="Запросов на клиента в сутки">
              <input name="perDay" type="number" inputMode="numeric" min={1} max={1000} defaultValue={perDay} className="input" />
            </Field>
          </div>
        </Group>
        <Actions>
          <SaveButton />
          <Result state={state} />
        </Actions>
      </form>
    </Section>
  );
}
