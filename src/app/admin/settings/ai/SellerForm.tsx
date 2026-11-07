"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckCircle2, LoaderCircle, MessagesSquare } from "lucide-react";
import { aiProviderIds, aiProviders, type AiProvider } from "@/modules/assistant/domain/providers";
import { Actions, CheckMessage, Choice, Field, Group, Note, Result, SaveButton, Section, SecretInput, type SheetStatus } from "../ui";
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
  const status: SheetStatus = !connected ? { tone: "warn", label: "не подключена: продажник на шаблонах" } : weak ? { tone: "warn", label: "бесплатная модель: ненадёжно" } : { tone: "ok", label: `${aiProviders[provider || assistantProvider].label} · ${shownModel}` };
  return (
    <Section
      id="ai-seller"
      defaultOpen={false}
      title="Прежняя модель продажника (запасная)"
      description="Запасная модель, если не Claude; на ней же бот работает при выключенной маршрутизации"
      status={status}
      actions={
        <button type="button" className="btn btn-outline btn-sm" disabled={pending || !connected} onClick={() => start(async () => setCheck(await testSellerAction()))}>
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <MessagesSquare className="size-4" aria-hidden />} Пробный диалог
        </button>
      }
    >
      <CheckMessage check={check} wrap />
      <form action={action} className="space-y-5">
        <Note>
          Основная модель продажника — Claude по уровням (лист «Маршрутизация» выше). Эта модель — запасная, если не Claude: на неё бот переключится, когда Claude недоступен (если в маршрутизации не отмечены другие запасные), и на ней бот работает при выключенной маршрутизации (Бот, Продажи, «AI-продажник»). Нужна сильная модель: Claude (Sonnet или Opus) или GPT — она надёжнее держит правила, лучше пишет по-казахски и реже ошибается в сроках. Бесплатные модели (<code className="rounded bg-sunken px-1">openrouter/free</code>) для продаж не рекомендуются: они нестабильны и могут не вернуть нужный JSON — тогда клиент получит «передала менеджеру». «Пробный диалог» запускает настоящий ход продажника на сохранённой модели: клиент спрашивает цену печатной книги — видно ответ, скорость и то, что модель отвечает по схеме. Клиенту ничего не отправляется.
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
                . Ключ общий для всех функций AI (хранится один раз).
              </>
            ) : undefined
          }
        >
          <div key={effective} className="space-y-4">
            <SecretInput name="key" label={`Ключ ${def.label} API`} saved={saved.apiKey} fromEnv={saved.apiKeyEnv} placeholder={def.keyPlaceholder} />
            <Field label="Модель продажника" hint={`Пусто — ${saved.model || def.defaultModel || "модель провайдера"}.`}>
              <input name="model" defaultValue={model} placeholder={effective === "openrouter" ? "например, anthropic/claude-sonnet-4.5 (точное название — в каталоге OpenRouter)" : saved.model || def.defaultModel} className="input" maxLength={100} />
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
