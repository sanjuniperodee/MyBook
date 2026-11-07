"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckCircle2, LoaderCircle, SpellCheck } from "lucide-react";
import { aiProviderIds, aiProviders, type AiProvider } from "@/modules/assistant/domain/providers";
import { Actions, CheckMessage, Choice, Field, Group, Note, Result, SaveButton, Section, SecretInput, Toggle, type SheetStatus } from "../ui";
import type { SettingsState } from "../state";
import { saveProofreadAction, testProofreadAction } from "./actions";
import { providerReady, type AiProviderSaved } from "./saved";

/**
 * AI-корректор в редакторе книги (кнопка «Проверить грамотность»): свой провайдер и модель, независимо от AI-помощника CRM —
 * например, бесплатная модель OpenRouter для клиентов и Claude для менеджеров. Помощник при письме (WriterForm) — отдельно.
 */
export function ProofreadForm({
  provider,
  assistantProvider,
  model,
  enabled,
  perTenMin,
  perDay,
  providers,
}: {
  /** "" — как у AI-помощника. */
  provider: AiProvider | "";
  assistantProvider: AiProvider;
  model: string;
  enabled: boolean;
  perTenMin: string;
  perDay: string;
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
  const status: SheetStatus = !connected ? { tone: "off", label: "AI не подключён: работают словарь и правила" } : enabled ? { tone: "ok", label: `${aiProviders[provider || assistantProvider].label} · включена` } : { tone: "off", label: "AI выключен" };
  return (
    <Section
      id="ai-proofread"
      defaultOpen={false}
      title="AI-корректор у клиента: «Проверить грамотность»"
      description="Запятые, согласование и опечатки в тексте ответа; орфография по словарю работает всегда"
      status={status}
      actions={
        <button type="button" className="btn btn-outline btn-sm" disabled={pending || !connected} onClick={() => start(async () => setCheck(await testProofreadAction()))}>
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <SpellCheck className="size-4" aria-hidden />} Проверить
        </button>
      }
    >
      <CheckMessage check={check} wrap />
      <form action={action} className="space-y-5">
        <Note>
          Клиенты видят ошибки прямо в тексте ответа, как в Grammarly. Орфография по словарю и правила оформления (пробелы, тире, кавычки, эмодзи) работают всегда и бесплатно. Кнопка «Проверить грамотность» — AI-корректор: запятые, согласование, опечатки. Ему можно дать отдельную, например бесплатную, модель: OpenRouter, <code className="rounded bg-sunken px-1">openrouter/free</code> сам выбирает доступную бесплатную модель. «Проверить» отправляет сохранённой модели фразу с ошибками и показывает, что она исправила.
        </Note>
        <Group title="Провайдер" hint="Галочка у названия — ключ уже сохранён.">
          <div className="flex flex-wrap gap-2">
            <Choice active={p === ""}>
              <input type="radio" name="provider" value="" checked={p === ""} onChange={() => setP("")} className="accent-wine" />
              Как у AI-помощника ({aiProviders[assistantProvider].label})
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
        <Group
          title="Ключ и модель"
          hint={
            def.keysUrl ? (
              <>
                Ключ создаётся в{" "}
                <a href={def.keysUrl} target="_blank" rel="noopener noreferrer" className="text-wine underline">
                  {new URL(def.keysUrl).hostname}
                </a>
                {effective === "openrouter" ? ". Бесплатные модели: ~50 запросов в день на аккаунт, с пополнением от $10 — 1000 в день. Повторные проверки того же текста берутся из кэша." : ". Ключ общий с AI-помощником."}
              </>
            ) : undefined
          }
        >
          <div key={effective} className="space-y-4">
            <SecretInput name="key" label={`Ключ ${def.label} API`} saved={saved.apiKey} fromEnv={saved.apiKeyEnv} placeholder={def.keyPlaceholder} />
            <Field label="Модель корректора" hint={`Пусто — ${saved.model || def.defaultModel || "модель провайдера"}.`}>
              <input name="model" defaultValue={model} placeholder={effective === "openrouter" ? "openrouter/free или, например, google/gemma-4-31b-it:free" : saved.model || def.defaultModel} className="input" maxLength={100} />
            </Field>
          </div>
        </Group>
        <Group title="Показ и лимиты" hint="Лимиты считаются на клиента; у бесплатных моделей свой общий дневной лимит, подстройте их под модель.">
          <Toggle name="enabled" defaultChecked={enabled} label="Показывать клиентам кнопку «Проверить грамотность»" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Проверок на клиента за 10 минут">
              <input name="perTenMin" type="number" inputMode="numeric" min={1} max={1000} defaultValue={perTenMin} className="input" />
            </Field>
            <Field label="Проверок на клиента в сутки">
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
