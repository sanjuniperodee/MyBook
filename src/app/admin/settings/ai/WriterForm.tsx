"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckCircle2, LoaderCircle, PenLine } from "lucide-react";
import { aiProviderIds, aiProviders, type AiProvider } from "@/modules/assistant/domain/providers";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Intro } from "@/components/admin/Intro";
import { Section, Status, Result, SecretInput, CheckMessage, Choice } from "../ui";
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
  return (
    <Section defaultOpen={false} title="AI-помощник при письме у клиента" badge={<Status on={connected && enabled} label={!connected ? "AI не подключён — кнопок у клиента нет" : enabled ? `${aiProviders[provider || proofreadProvider].label} · включён` : "выключен"} />}>
      <Intro className="mb-4">
        Кнопки под полем ответа в редакторе книги: «Оформить», «Улучшить», «Короче», «Длиннее» и «Переписать по просьбе». Это не корректор грамотности (он выше) и не AI-помощник менеджеров в CRM. Модель можно взять дешёвую
        или бесплатную — тексты клиентов уходят только ей.
      </Intro>
      <form action={action} className="space-y-3">
        <div className="flex flex-wrap gap-2 text-sm">
          <Choice active={p === ""}>
            <input type="radio" name="provider" value="" checked={p === ""} onChange={() => setP("")} className="accent-wine" />
            Как у корректора ({aiProviders[proofreadProvider].label})
          </Choice>
          {aiProviderIds.map((id) => (
            <Choice key={id} active={p === id}>
              <input type="radio" name="provider" value={id} checked={p === id} onChange={() => setP(id)} className="accent-wine" />
              {aiProviders[id].title}
              {ready(id) ? <CheckCircle2 className="size-3.5 text-emerald-700" aria-label="ключ сохранён" /> : null}
            </Choice>
          ))}
        </div>
        <div key={effective} className="space-y-3">
          <SecretInput name="key" label={`Ключ ${def.label} API`} saved={saved.apiKey} fromEnv={saved.apiKeyEnv} placeholder={def.keyPlaceholder} />
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Модель помощника (пусто — как у корректора, иначе {saved.model || def.defaultModel || "модель провайдера"})</span>
            <input name="model" defaultValue={model} placeholder={saved.model || def.defaultModel} className="input h-10 text-sm" maxLength={100} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="enabled" defaultChecked={enabled} className="accent-wine" /> Показывать клиентам кнопки помощника
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Запросов на клиента за 10 минут</span>
            <input name="perTenMin" type="number" inputMode="numeric" min={1} max={1000} defaultValue={perTenMin} className="input h-10 w-28 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Запросов на клиента в сутки</span>
            <input name="perDay" type="number" inputMode="numeric" min={1} max={1000} defaultValue={perDay} className="input h-10 w-28 text-sm" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton className="btn-sm">Сохранить</SubmitButton>
          <button type="button" className="btn btn-outline btn-sm" disabled={pending || !connected} onClick={() => start(async () => setCheck(await testWriterAction()))}>
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : <PenLine className="size-4" />} Проверить помощника
          </button>
          <Result state={state} />
        </div>
        <CheckMessage check={check} wrap />
        <p className="text-xs text-muted">«Проверить помощника» просит сохранённую модель улучшить короткий текст и показывает ответ. Пока провайдер и модель пусты, помощник работает на корректоре — как было раньше.</p>
      </form>
    </Section>
  );
}
