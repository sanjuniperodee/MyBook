"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckCircle2, LoaderCircle, SpellCheck } from "lucide-react";
import { aiProviderIds, aiProviders, type AiProvider } from "@/modules/assistant/domain/providers";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Intro } from "@/components/admin/Intro";
import { Section, Status, Result, SecretInput, CheckMessage, Choice } from "../ui";
import type { SettingsState } from "../state";
import { saveProofreadAction, testProofreadAction } from "./actions";
import { providerReady, type AiProviderSaved } from "./saved";

/**
 * AI-корректор в редакторе книги: свой провайдер и модель, независимо от AI-помощника CRM —
 * например, бесплатная модель OpenRouter для клиентов и Claude для менеджеров.
 */
export function ProofreadForm({
  provider,
  assistantProvider,
  model,
  enabled,
  providers,
}: {
  /** "" — как у AI-помощника. */
  provider: AiProvider | "";
  assistantProvider: AiProvider;
  model: string;
  enabled: boolean;
  providers: Record<AiProvider, AiProviderSaved>;
}) {
  const [state, action] = useActionState<SettingsState, FormData>(saveProofreadAction, {});
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const [p, setP] = useState<AiProvider | "">(provider);
  const effective = p || assistantProvider;
  const def = aiProviders[effective];
  const saved = providers[effective];
  const ready = (id: AiProvider) => providerReady(providers, id);
  const connected = ready(provider || assistantProvider);
  return (
    <Section defaultOpen={false} title="Проверка текста в редакторе" badge={<Status on={connected && enabled} label={!connected ? "AI не подключён — работают словарь и правила" : enabled ? `${aiProviders[provider || assistantProvider].label} · включена` : "AI выключен"} />}>
      <Intro className="mb-4">
        Клиенты видят ошибки прямо в тексте ответа, как в Grammarly. Орфография по словарю и правила оформления (пробелы, тире, кавычки, эмодзи) работают всегда и бесплатно. Кнопка «Проверить грамотность» —
        AI-корректор: запятые, согласование, опечатки. Ему можно дать отдельную, например бесплатную, модель: OpenRouter → <code className="rounded bg-cream px-1">openrouter/free</code> сам выбирает доступную бесплатную модель.
      </Intro>
      <form action={action} className="space-y-3">
        <div className="flex flex-wrap gap-2 text-sm">
          <Choice active={p === ""}>
            <input type="radio" name="provider" value="" checked={p === ""} onChange={() => setP("")} className="accent-wine" />
            Как у AI-помощника ({aiProviders[assistantProvider].label})
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
          {def.keysUrl ? (
            <p className="text-xs text-muted">
              Ключ создаётся в{" "}
              <a href={def.keysUrl} target="_blank" rel="noopener noreferrer" className="text-wine underline">
                {new URL(def.keysUrl).hostname}
              </a>
              {effective === "openrouter" ? ". Бесплатные модели: ~50 запросов в день на аккаунт, с пополнением от $10 — 1000 в день. Повторные проверки того же текста берутся из кэша." : ". Ключ общий с AI-помощником."}
            </p>
          ) : null}
          <SecretInput name="key" label={`Ключ ${def.label} API`} saved={saved.apiKey} fromEnv={saved.apiKeyEnv} placeholder={def.keyPlaceholder} />
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Модель корректора (пусто — {saved.model || def.defaultModel || "модель провайдера"})</span>
            <input name="model" defaultValue={model} placeholder={effective === "openrouter" ? "openrouter/free или, например, google/gemma-4-31b-it:free" : saved.model || def.defaultModel} className="input h-10 text-sm" maxLength={100} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="enabled" defaultChecked={enabled} className="accent-wine" /> Показывать клиентам кнопку «Проверить грамотность»
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton className="btn-sm">Сохранить</SubmitButton>
          <button type="button" className="btn btn-outline btn-sm" disabled={pending || !connected} onClick={() => start(async () => setCheck(await testProofreadAction()))}>
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : <SpellCheck className="size-4" />} Проверить корректор
          </button>
          <Result state={state} />
        </div>
        <CheckMessage check={check} wrap />
        <p className="text-xs text-muted">«Проверить корректор» отправляет сохранённой модели фразу с ошибками и показывает, что она исправила. Лимит для клиента — 10 проверок за 10 минут и 80 в день.</p>
      </form>
    </Section>
  );
}
