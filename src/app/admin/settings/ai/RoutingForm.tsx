"use client";

import { useActionState, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { aiProviderIds, aiProviders, type AiProvider } from "@/modules/assistant/domain/providers";
import { DEFAULT_TIER_MODELS, SELLER_TIERS, type RouteMode, type SellerTier } from "@/modules/assistant/domain/routing";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Section, Status, Result, Choice } from "../ui";
import type { SettingsState } from "../state";
import { saveRoutingAction } from "./actions";
import { providerReady, type AiProviderSaved } from "./saved";

const MODES: [RouteMode, string, string][] = [
  ["on", "Включена", "Haiku отвечает на обычные сообщения, Sonnet — на возражения, подбор и сложные вопросы, Opus — на редкие исключения."],
  ["shadow", "Наблюдение", "Отвечает уровень по умолчанию; какой уровень выбрал бы маршрут, видно в «Почему так?» и статистике бота. Лишних запросов нет."],
  ["off", "Выключена", "Как раньше: одна модель продажника из блока ниже, без запасных."],
];
const TIER_LABELS: Record<SellerTier, string> = { haiku: "Haiku", sonnet: "Sonnet", opus: "Opus" };

export interface RoutingSaved {
  mode: RouteMode;
  defaultTier: SellerTier;
  models: Record<SellerTier, string>;
  fallbacks: string;
  sonnetAt: string;
  opusAt: string;
  maxExtra: string;
  budget: string;
  dailyBudget: string;
  prices: string;
  /** Поля, заданные переменными окружения: в админке только для чтения. */
  env: string[];
}

/**
 * Маршрутизация модели AI-продажника: Claude — основная модель по уровням (Haiku / Sonnet / Opus), остальные провайдеры —
 * запасные, только если Claude не ответил или не подключён.
 */
export function RoutingForm({ saved, providers, legacyProvider }: { saved: RoutingSaved; providers: Record<AiProvider, AiProviderSaved>; legacyProvider: AiProvider }) {
  const [state, action] = useActionState<SettingsState, FormData>(saveRoutingAction, {});
  const [mode, setMode] = useState<RouteMode>(saved.mode);
  const listed = saved.fallbacks.split(/[\s,;]+/).filter(Boolean);
  const claudeReady = providerReady(providers, "anthropic");
  const env = (k: string) => saved.env.includes(k);
  const others = aiProviderIds.filter((p) => p !== "anthropic");
  return (
    <Section
      title="Маршрутизация модели продажника"
      badge={<Status on={mode !== "off" && claudeReady} label={mode === "off" ? "выключена — одна модель" : !claudeReady ? "нет ключа Claude — отвечают запасные" : mode === "shadow" ? "наблюдение" : "Claude Haiku / Sonnet / Opus"} />}
    >
      <p className="mb-3 text-sm text-ink-soft">
        Основная модель бота — Claude: уровень выбирается под каждое сообщение клиента по признакам сложности (возражение, торг, сравнение вариантов, несколько условий, противоречия, повтор нерешённого вопроса), без лишнего запроса к модели. Если ответ не прошёл проверку или
        модель не уверена — ход переписывает уровень выше. Другие провайдеры — только запасные: на них бот переключается, если Claude недоступен.
      </p>
      <form action={action} className="space-y-3">
        <div className="space-y-1.5 text-sm">
          {MODES.map(([id, label, hint]) => (
            <label key={id} className="flex items-start gap-2">
              <input type="radio" name="mode" value={id} checked={mode === id} onChange={() => setMode(id)} disabled={env("seller.route")} className="mt-1 accent-wine" />
              <span>
                <span className="font-medium">{label}</span> <span className="text-xs text-muted">— {hint}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {SELLER_TIERS.map((t) => (
            <label key={t} className="block">
              <span className="mb-1 block text-xs text-muted">Модель {TIER_LABELS[t]}</span>
              <input name={`model_${t}`} defaultValue={saved.models[t]} placeholder={DEFAULT_TIER_MODELS[t]} disabled={env(`seller.route.${t}`)} className="input h-10 text-sm" maxLength={100} />
            </label>
          ))}
        </div>
        <label className="block max-w-xs">
          <span className="mb-1 block text-xs text-muted">Уровень по умолчанию (и в режиме наблюдения)</span>
          <select name="defaultTier" defaultValue={saved.defaultTier} disabled={env("seller.route.default")} className="input h-10 text-sm">
            {SELLER_TIERS.map((t) => (
              <option key={t} value={t}>
                {TIER_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span className="mb-1 block text-xs text-muted">Запасные провайдеры (по порядку списка; ни один не отмечен — {legacyProvider === "anthropic" ? "запасных нет" : `прежний провайдер продажника: ${aiProviders[legacyProvider].label}`})</span>
          <div className="flex flex-wrap gap-2 text-sm">
            {others.map((id) => (
              <Choice key={id} active={listed.includes(id)}>
                <input type="checkbox" name="fallback" value={id} defaultChecked={listed.includes(id)} disabled={env("seller.fallbacks")} className="accent-wine" />
                {aiProviders[id].label}
                {providerReady(providers, id) ? <CheckCircle2 className="size-3.5 text-emerald-700" aria-label="ключ сохранён" /> : null}
              </Choice>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">Запасному провайдеру уходит та же переписка, что и Claude. Отмечайте только тех, кому вы доверяете данные клиентов.</p>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-muted">Пороги, лимиты и прайс</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <NumberField name="sonnetAt" label="Очков сложности для Sonnet" value={saved.sonnetAt} placeholder="2" disabled={env("seller.route.sonnetAt")} />
            <NumberField name="opusAt" label="Очков сложности для Opus" value={saved.opusAt} placeholder="6" disabled={env("seller.route.opusAt")} />
            <NumberField name="maxExtra" label="Эскалаций за сообщение (0–4)" value={saved.maxExtra} placeholder="2" disabled={env("seller.route.maxExtra")} />
            <NumberField name="budget" label="Потолок на беседу, $ (0 — без потолка)" value={saved.budget} placeholder="0.5" disabled={env("seller.route.budget")} />
            <NumberField name="dailyBudget" label="Потолок в сутки, $ (пусто или 0 — без)" value={saved.dailyBudget} placeholder="" disabled={env("seller.route.dailyBudget")} />
          </div>
          <label className="mt-2 block">
            <span className="mb-1 block text-xs text-muted">Прайс, $ за 1M токенов (JSON; пусто — цены Anthropic по умолчанию)</span>
            <textarea name="prices" defaultValue={saved.prices} disabled={env("seller.route.prices")} rows={3} className="input text-xs" placeholder='{"claude-haiku-5-5": {"input": 0.1, "output": 0.5, "cacheRead": 0.01, "cacheWrite": 0.2}}' maxLength={4000} />
          </label>
          <p className="mt-1 text-xs text-muted">На потолке расходов бот отвечает только на Haiku, без эскалаций. Расходы и доли моделей — в статистике бота (Бот → Статистика).</p>
        </details>
        {saved.env.length ? <p className="text-xs text-muted">Часть полей задана переменными окружения сервера — они важнее админки.</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton className="btn-sm">Сохранить</SubmitButton>
          <Result state={state} />
        </div>
      </form>
    </Section>
  );
}

function NumberField({ name, label, value, placeholder, disabled }: { name: string; label: string; value: string; placeholder: string; disabled: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <input name={name} defaultValue={value} placeholder={placeholder} disabled={disabled} inputMode="decimal" className="input h-10 text-sm" maxLength={10} />
    </label>
  );
}
