"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckCircle2, LoaderCircle, MessagesSquare } from "lucide-react";
import { aiProviderIds, aiProviders, type AiProvider } from "@/modules/assistant/domain/providers";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Intro } from "@/components/admin/Intro";
import { Section, Status, Result, SecretInput, CheckMessage, Choice } from "../ui";
import type { SettingsState } from "../state";
import { saveSellerAction, testSellerAction } from "./actions";
import { providerReady, type AiProviderSaved } from "./saved";

/**
 * Модель AI-продажника бота. Отдельно от AI-помощника: продающая беседа требует сильной модели, которая надёжно отвечает
 * JSON и держит правила (не выдумывает цены), а подсказки менеджеру могут идти и на лёгкой.
 */
export function SellerForm({
  provider,
  assistantProvider,
  model,
  providers,
}: {
  /** "" — как у AI-помощника. */
  provider: AiProvider | "";
  assistantProvider: AiProvider;
  model: string;
  providers: Record<AiProvider, AiProviderSaved>;
}) {
  const [state, action] = useActionState<SettingsState, FormData>(saveSellerAction, {});
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const [p, setP] = useState<AiProvider | "">(provider);
  const effective = p || assistantProvider;
  const def = aiProviders[effective];
  const saved = providers[effective];
  const ready = (id: AiProvider) => providerReady(providers, id);
  const connected = ready(provider || assistantProvider);
  const shownModel = model || providers[provider || assistantProvider].model || aiProviders[provider || assistantProvider].defaultModel;
  const weak = /free/i.test(shownModel);
  return (
    <Section defaultOpen={false} title="Прежняя модель продажника (запасная)" badge={<Status on={connected && !weak} label={!connected ? "не подключена — продажник на шаблонах" : weak ? "бесплатная модель — ненадёжно" : `${aiProviders[provider || assistantProvider].label} · ${shownModel}`} />}>
      <Intro className="mb-4">
        Основная модель продажника — Claude по уровням (блок «Маршрутизация» выше). Эта модель — запасная, если не Claude: на неё бот переключится, когда Claude недоступен (если в маршрутизации не отмечены другие запасные), и на ней
        бот работает при выключенной маршрутизации (Бот → Продажи → «AI-продажник»). Нужна сильная модель: Claude (Sonnet или Opus) или GPT — она надёжнее держит правила, лучше пишет по-казахски и реже ошибается в
        сроках. Бесплатные модели (<code className="rounded bg-cream px-1">openrouter/free</code>) для продаж не рекомендуются: они нестабильны и могут не вернуть нужный JSON — тогда клиент получит «передала менеджеру».
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
              . Ключ общий для всех функций AI (хранится один раз).
            </p>
          ) : null}
          <SecretInput name="key" label={`Ключ ${def.label} API`} saved={saved.apiKey} fromEnv={saved.apiKeyEnv} placeholder={def.keyPlaceholder} />
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Модель продажника (пусто — {saved.model || def.defaultModel || "модель провайдера"})</span>
            <input name="model" defaultValue={model} placeholder={effective === "openrouter" ? "например, anthropic/claude-sonnet-4.5 (точное название — в каталоге OpenRouter)" : saved.model || def.defaultModel} className="input h-10 text-sm" maxLength={100} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton className="btn-sm">Сохранить</SubmitButton>
          <button type="button" className="btn btn-outline btn-sm" disabled={pending || !connected} onClick={() => start(async () => setCheck(await testSellerAction()))}>
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : <MessagesSquare className="size-4" />} Пробный диалог
          </button>
          <Result state={state} />
        </div>
        <CheckMessage check={check} wrap />
        <p className="text-xs text-muted">«Пробный диалог» запускает настоящий ход продажника на сохранённой модели: клиент спрашивает цену печатной книги — видно ответ, скорость и то, что модель отвечает по схеме. Клиенту ничего не отправляется.</p>
      </form>
    </Section>
  );
}
