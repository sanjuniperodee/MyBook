"use client";

import { useActionState, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { aiProviderIds, aiProviders, type AiProvider } from "@/modules/assistant/domain/providers";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Section, Status, Result, SecretInput, Choice } from "../ui";
import type { SettingsState } from "../state";
import { saveMediaAction } from "./actions";
import { providerReady, type AiProviderSaved } from "./saved";

/** Модель OpenRouter для голосовых и фото по умолчанию (как в assistant/infrastructure/connection.ts). */
const OPENROUTER_MEDIA_MODEL = "google/gemini-2.5-flash";

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
  vision = true,
}: {
  /** "" — как у продажника. */
  provider: AiProvider | "";
  sellerProvider: AiProvider;
  sellerModel: string;
  model: string;
  providers: Record<AiProvider, AiProviderSaved>;
  /** Фото, скриншоты и PDF — через Claude Vision (при ключе Claude), а не этой моделью. */
  vision?: boolean;
}) {
  const [state, action] = useActionState<SettingsState, FormData>(saveMediaAction, {});
  const [p, setP] = useState<AiProvider | "">(provider);
  const effective = p || sellerProvider;
  const def = aiProviders[effective];
  const saved = providers[effective];
  const ready = (id: AiProvider) => providerReady(providers, id);
  const savedEffective = provider || sellerProvider;
  const fallback = savedEffective === "groq" ? "whisper-large-v3" : savedEffective === "openrouter" ? OPENROUTER_MEDIA_MODEL : provider ? providers[savedEffective].model || aiProviders[savedEffective].defaultModel : sellerModel || providers[savedEffective].model || aiProviders[savedEffective].defaultModel;
  const shownModel = model || fallback;
  const cannot = savedEffective === "deepseek";
  const connected = ready(savedEffective) && !cannot;
  return (
    <Section title="Голосовые и фото клиента (бот)" badge={<Status on={connected} label={cannot ? "DeepSeek не слушает голосовые — выберите OpenRouter" : !connected ? "не подключено — голосовые бот не слушает" : `${aiProviders[savedEffective].label} · ${shownModel}`} />}>
      <p className="mb-3 text-sm text-ink-soft">
        Этой моделью AI-продажник расшифровывает голосовые и описывает фото клиента (Бот → Продажи → «Слушать голосовые и смотреть фото»), а дальше отвечает на них, как на текст. Нужна модель, которая понимает аудио и изображения:
        лучше всего <code className="rounded bg-cream px-1">{OPENROUTER_MEDIA_MODEL}</code> через OpenRouter — слушает голосовые и видит фото, около 0,3 ₸ за голосовое, но OpenRouter принимает аудио только при балансе от $0.50 (бесплатные модели аудио не берут). Бесплатно — Groq: ключ на console.groq.com, модель Whisper расшифровывает голосовые (фото — нет). Claude видит фото, но не слушает голосовые; DeepSeek не умеет ни то, ни другое.
      </p>
      <form action={action} className="space-y-3">
        <div className="flex flex-wrap gap-2 text-sm">
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
                {ready(id) ? <CheckCircle2 className="size-3.5 text-emerald-700" aria-label="ключ сохранён" /> : null}
              </Choice>
            ))}
        </div>
        <div key={effective} className="space-y-3">
          <SecretInput name="key" label={`Ключ ${def.label} API`} saved={saved.apiKey} fromEnv={saved.apiKeyEnv} placeholder={def.keyPlaceholder} />
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Модель (пусто — {effective === "groq" ? "whisper-large-v3" : effective === "openrouter" ? OPENROUTER_MEDIA_MODEL : p ? saved.model || def.defaultModel : "как у продажника"})</span>
            <input name="model" defaultValue={model} placeholder={effective === "openrouter" ? OPENROUTER_MEDIA_MODEL : saved.model || def.defaultModel} className="input h-10 text-sm" maxLength={100} />
          </label>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="vision" defaultChecked={vision} className="mt-0.5 accent-wine" />
          <span>
            Фото, скриншоты и PDF читает Claude (Vision), если подключён ключ Claude
            <span className="block text-xs text-muted">Видимый текст, таблицы и сканы; голосовые — всегда моделью выше (Claude их не слушает). Word, Excel и текстовые файлы читаются на сервере, никуда не отправляясь. Видео бот не разбирает.</span>
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton className="btn-sm">Сохранить</SubmitButton>
          <Result state={state} />
        </div>
      </form>
    </Section>
  );
}
