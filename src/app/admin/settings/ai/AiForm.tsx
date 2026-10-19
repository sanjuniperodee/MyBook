"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckCircle2, LoaderCircle, PlugZap } from "lucide-react";
import { aiProviderIds, aiProviders, type AiProvider } from "@/modules/assistant/domain/providers";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Section, Status, Result, SecretInput, CheckMessage, Choice } from "../ui";
import type { SettingsState } from "../state";
import { saveAiAction, testAiAction } from "./actions";
import { providerReady, type AiProviderSaved } from "./saved";

export function AiForm({
  provider,
  providerFromEnv,
  providers,
  enabled,
  knowledge,
}: {
  provider: AiProvider;
  providerFromEnv: boolean;
  providers: Record<AiProvider, AiProviderSaved>;
  enabled: boolean;
  knowledge: string;
}) {
  const [state, action] = useActionState<SettingsState, FormData>(saveAiAction, {});
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const [p, setP] = useState<AiProvider>(provider);
  const def = aiProviders[p];
  const saved = providers[p];
  const ready = (id: AiProvider) => providerReady(providers, id);
  const connected = ready(provider);
  return (
    <Section
      title="AI-помощник"
      badge={<Status on={connected && enabled} label={!connected ? "не подключён" : enabled ? `${aiProviders[provider].label === "AI" ? "свой сервер" : aiProviders[provider].label} · включён` : "выключен"} />}
    >
      <p className="mb-3 text-sm text-ink-soft">
        Подсказывает ответ клиенту в чате, делает резюме сделки со следующим шагом и сам заполняет поля (повод, дата, для кого) из переписки. Можно подключить Claude, ChatGPT, DeepSeek или любой сервис с
        OpenAI-совместимым API (OpenRouter, Qwen, своя модель). Ключи разных провайдеров хранятся отдельно — переключаться можно в любой момент.
      </p>
      <form action={action} className="space-y-3">
        <div className="flex flex-wrap gap-2 text-sm">
          {aiProviderIds.map((id) => (
            <Choice key={id} active={p === id}>
              <input type="radio" name="provider" value={id} checked={p === id} onChange={() => setP(id)} disabled={providerFromEnv} className="accent-wine" />
              {aiProviders[id].title}
              {ready(id) ? <CheckCircle2 className="size-3.5 text-emerald-700" aria-label="ключ сохранён" /> : null}
            </Choice>
          ))}
          {providerFromEnv ? <input type="hidden" name="provider" value={provider} /> : null}
        </div>
        <div key={p} className="space-y-3">
          {def.keysUrl ? (
            <p className="text-xs text-muted">
              Ключ API создаётся в консоли{" "}
              <a href={def.keysUrl} target="_blank" rel="noopener noreferrer" className="text-wine underline">
                {new URL(def.keysUrl).hostname}
              </a>
              {p === "anthropic" ? ". Если основная модель откажется отвечать на запрос, Anthropic автоматически повторит его на резервной модели." : "."}
            </p>
          ) : (
            <p className="text-xs text-muted">Укажите адрес API вида https://openrouter.ai/api/v1 (запросы идут на …/chat/completions) и название модели. Ключ — если сервис его требует.</p>
          )}
          <SecretInput name="aiKey" label={p === "custom" ? "Ключ API (необязательно)" : `Ключ ${def.label} API`} saved={saved.apiKey} fromEnv={saved.apiKeyEnv} placeholder={def.keyPlaceholder} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Модель{def.defaultModel ? " (пусто — по умолчанию)" : ""}</span>
              <input name="aiModel" defaultValue={saved.model} placeholder={def.defaultModel || "например, qwen/qwen3-235b-a22b"} className="input h-10 text-sm" maxLength={100} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted">{p === "custom" ? "Адрес API" : "Адрес API (обычно не меняется)"}</span>
              <input name="aiBaseUrl" defaultValue={saved.baseUrl} disabled={saved.baseUrlEnv} placeholder={def.defaultBaseUrl || "https://…/v1"} className="input h-10 text-sm" />
            </label>
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">База знаний для ответов: правила, сроки, ответы на частые вопросы (тарифы и цены AI берёт с сайта сам)</span>
          <textarea name="knowledge" defaultValue={knowledge} rows={5} maxLength={6000} className="input py-2 text-sm" placeholder="Например: скидки больше 15% согласовываем с руководителем; печать 5–7 рабочих дней; можно добавить до 200 фото…" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="enabled" defaultChecked={enabled} className="accent-wine" /> Показывать AI-кнопки менеджерам
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton className="btn-sm">Сохранить</SubmitButton>
          <button type="button" className="btn btn-outline btn-sm" disabled={pending || !connected} onClick={() => start(async () => setCheck(await testAiAction()))}>
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : <PlugZap className="size-4" />} Проверить
          </button>
          <Result state={state} />
        </div>
        <CheckMessage check={check} />
        <p className="text-xs text-muted">«Проверить» отправляет короткий запрос выбранной и сохранённой модели. Расшифровка записей звонков пока не поддерживается: помощник работает с текстом, а не со звуком.</p>
      </form>
    </Section>
  );
}
