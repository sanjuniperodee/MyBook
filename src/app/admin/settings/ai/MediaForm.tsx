"use client";

import { useActionState, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { aiProviderIds, aiProviders, mediaDefaultModels, type AiProvider, modelFits } from "@/modules/assistant/domain/providers";
import { Actions, Choice, Field, Group, Note, Result, SaveButton, Section, SecretInput, type SheetStatus } from "../ui";
import type { SettingsState } from "@/lib/crm/settings-state";
import { saveMediaAction } from "./actions";
import { providerReady, type AiProviderSaved } from "./saved";


/**
 * Распознавание голосовых и фото клиента для AI-продажника. Отдельно от модели продажника: беседу можно вести на модели
 * без vision/аудио (DeepSeek), а голосовые слушать мультимодальной (Gemini Flash через OpenRouter).
 */
export function MediaForm({
  provider,
  sellerProvider,
  sellerModel,
  model,
  providers,
}: {
  /** "" — как у продажника. */
  provider: AiProvider | "";
  sellerProvider: AiProvider;
  sellerModel: string;
  model: string;
  providers: Record<AiProvider, AiProviderSaved>;
}) {
  const [state, action] = useActionState<SettingsState, FormData>(saveMediaAction, {});
  const [p, setP] = useState<AiProvider | "">(provider);
  const effective = p || sellerProvider;
  const def = aiProviders[effective];
  const saved = providers[effective];
  const ready = (id: AiProvider) => providerReady(providers, id);
  const savedEffective = provider || sellerProvider;
  const fallback = mediaDefaultModels[savedEffective] ?? (provider ? providers[savedEffective].model || aiProviders[savedEffective].defaultModel : sellerModel || providers[savedEffective].model || aiProviders[savedEffective].defaultModel);
  const shownModel = model || fallback;
  const cannot = savedEffective === "deepseek";
  const connected = ready(savedEffective) && !cannot;
  const status: SheetStatus = cannot ? { tone: "bad", label: "DeepSeek не слушает голосовые: выберите OpenRouter" } : !connected ? { tone: "off", label: "не подключено: голосовые бот не слушает" } : { tone: "ok", label: `${aiProviders[savedEffective].label} · ${shownModel}` };
  return (
    <Section id="ai-media" defaultOpen={false} title="Голосовые и фото клиента (бот)" description="Модель, которой AI-продажник расшифровывает голосовые и описывает фото" status={status}>
      <form action={action} className="space-y-5">
        <Note>
          Этой моделью AI-продажник расшифровывает голосовые и описывает фото клиента (Бот, Продажи, «Слушать голосовые и смотреть фото»), а дальше отвечает на них, как на текст. Нужна модель, которая понимает аудио и изображения: лучше всего <code className="rounded bg-sunken px-1">{mediaDefaultModels.openrouter}</code> через OpenRouter — слушает голосовые и видит фото, около 0,3 ₸ за голосовое, но OpenRouter принимает аудио только при балансе от $0.50 (бесплатные модели аудио не берут). Groq: ключ на console.groq.com, Whisper large-v3-turbo расшифровывает голосовые за $0.04 в час аудио (фото — нет). Claude видит фото, но не слушает голосовые; DeepSeek не умеет ни то, ни другое.
        </Note>
        <Group title="Провайдер" hint="Галочка у названия — ключ уже сохранён.">
          <div className="flex flex-wrap gap-2">
            <Choice active={p === ""}>
              <input type="radio" name="provider" value="" checked={p === ""} onChange={() => setP("")} className="accent-wine" />
              Как у продажника ({aiProviders[sellerProvider].label})
            </Choice>
            {aiProviderIds
              .filter((id) => id !== "deepseek")
              .map((id) => (
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
            <Field label="Модель" hint={`Пусто — ${mediaDefaultModels[effective] ?? (p ? saved.model || def.defaultModel : "как у продажника")}.`}>
              <input name="model" defaultValue={p === provider && modelFits(effective, model) ? model : ""} placeholder={mediaDefaultModels[effective] ?? (saved.model || def.defaultModel)} className="input" maxLength={100} />
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
