"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckCircle2, LoaderCircle, PlugZap } from "lucide-react";
import { aiProviderIds, aiProviders, type AiProvider } from "@/modules/assistant/domain/providers";
import { Actions, CheckMessage, Choice, Field, Group, Note, Result, SaveButton, Section, SecretInput, Toggle, type SheetStatus } from "../ui";
import type { SettingsState } from "../state";
import { saveAiAction, testAiAction } from "./actions";
import { providerReady, type AiProviderSaved } from "./saved";

export function AiForm({
  provider,
  providerFromEnv,
  providers,
  enabled,
  autofill,
  knowledge,
}: {
  provider: AiProvider;
  providerFromEnv: boolean;
  providers: Record<AiProvider, AiProviderSaved>;
  enabled: boolean;
  /** Автозаполнение пустых полей сделки из переписки (bots-4). */
  autofill: boolean;
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
  const status: SheetStatus = !connected ? { tone: "off", label: "не подключён" } : enabled ? { tone: "ok", label: `${aiProviders[provider].label === "AI" ? "свой сервер" : aiProviders[provider].label} · включён` } : { tone: "off", label: "выключен" };
  return (
    <Section
      id="ai-assistant"
      title="AI-помощник менеджеров (CRM) и ключи провайдеров"
      description="Подсказывает ответ в чате, делает резюме сделки со следующим шагом и сам заполняет поля сделки"
      status={status}
      actions={
        <button type="button" className="btn btn-outline btn-sm" disabled={pending || !connected} onClick={() => start(async () => setCheck(await testAiAction()))}>
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <PlugZap className="size-4" aria-hidden />} Проверить
        </button>
      }
    >
      <CheckMessage check={check} />
      <form action={action} className="space-y-5">
        <Note>
          Для менеджеров, не для клиентов: подсказывает ответ клиенту в чате, делает резюме сделки со следующим шагом и сам заполняет поля (повод, дата, для кого) из переписки. Можно подключить Claude, ChatGPT, DeepSeek или любой сервис с OpenAI-совместимым API (OpenRouter, Qwen, своя модель). Ключи разных провайдеров хранятся отдельно — переключаться можно в любой момент. «Проверить» отправляет короткий запрос выбранной и сохранённой модели. Расшифровка записей звонков пока не поддерживается: помощник работает с текстом, а не со звуком.
        </Note>
        <Group title="Провайдер" hint="Галочка у названия — ключ уже сохранён.">
          <div className="flex flex-wrap gap-2">
            {aiProviderIds.map((id) => (
              <Choice key={id} active={p === id}>
                <input type="radio" name="provider" value={id} checked={p === id} onChange={() => setP(id)} disabled={providerFromEnv} className="accent-wine" />
                {aiProviders[id].title}
                {ready(id) ? <CheckCircle2 className="size-3.5 text-success" aria-label="ключ сохранён" /> : null}
              </Choice>
            ))}
            {providerFromEnv ? <input type="hidden" name="provider" value={provider} /> : null}
          </div>
        </Group>
        <Group
          title="Ключ и модель"
          hint={
            def.keysUrl ? (
              <>
                Ключ API создаётся в консоли{" "}
                <a href={def.keysUrl} target="_blank" rel="noopener noreferrer" className="text-wine underline">
                  {new URL(def.keysUrl).hostname}
                </a>
                {p === "anthropic" ? ". Если основная модель откажется отвечать на запрос, Anthropic автоматически повторит его на резервной модели." : "."}
              </>
            ) : (
              "Укажите адрес API вида https://openrouter.ai/api/v1 (запросы идут на …/chat/completions) и название модели. Ключ — если сервис его требует."
            )
          }
        >
          <div key={p} className="space-y-4">
            <SecretInput name="aiKey" label={p === "custom" ? "Ключ API (необязательно)" : `Ключ ${def.label} API`} saved={saved.apiKey} fromEnv={saved.apiKeyEnv} placeholder={def.keyPlaceholder} />
            <Field label="Модель" hint={def.defaultModel ? "Пусто — модель по умолчанию." : undefined}>
              <input name="aiModel" defaultValue={saved.model} placeholder={def.defaultModel || "например, qwen/qwen3-235b-a22b"} className="input" maxLength={100} />
            </Field>
            <Field label="Адрес API" hint={p === "custom" ? undefined : "Обычно не меняется."}>
              <input name="aiBaseUrl" defaultValue={saved.baseUrl} disabled={saved.baseUrlEnv} placeholder={def.defaultBaseUrl || "https://…/v1"} className="input" />
            </Field>
          </div>
        </Group>
        <Group title="Для менеджеров" hint="Что знает помощник и что он делает сам.">
          <Field label="База знаний для ответов" hint="Правила, сроки, ответы на частые вопросы. Тарифы и цены AI берёт с сайта сам.">
            <textarea name="knowledge" defaultValue={knowledge} rows={5} maxLength={6000} className="input" placeholder="Например: скидки больше 15% согласовываем с руководителем; печать 5–7 рабочих дней; можно добавить до 200 фото…" />
          </Field>
          <Toggle name="enabled" defaultChecked={enabled} label="Показывать AI-кнопки менеджерам" />
          <Toggle
            name="autofill"
            defaultChecked={autofill}
            label="Заполнять сам пустые «Дату события», «Для кого» и «Повод» в сделке"
            hint="Из переписки менеджера, раз в 15 минут, когда разговор затих, до 100 диалогов в сутки. Текст переписки уходит провайдеру модели; что заполнено — видно в ленте сделки."
          />
        </Group>
        <Actions>
          <SaveButton />
          <Result state={state} />
        </Actions>
      </form>
    </Section>
  );
}
