"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { DESIGN_MODEL_TIERS, DESIGN_MODELS, DESIGN_SCENARIOS, type DesignAiSettings, type DesignModelTier, type DesignScenario } from "@/lib/book/design-ai";
import { grantCreditsAction, saveDesignerSettingsAction, saveFreeLimitAction, type AiDesignerState } from "./actions";

/** Бесплатный лимит на клиента. */
export function FreeLimitForm({ limit, max, canEdit }: { limit: number; max: number; canEdit: boolean }) {
  const [state, action] = useActionState<AiDesignerState, FormData>(saveFreeLimitAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3" data-testid="ai-free-limit">
      <div>
        <label className="label" htmlFor="limit">
          Бесплатных запросов на клиента
        </label>
        <input id="limit" name="limit" type="number" inputMode="numeric" min={0} max={max} step={1} defaultValue={limit} disabled={!canEdit} className="input w-32 tabular-nums" />
      </div>
      {canEdit ? <SubmitButton className="btn-dark">Сохранить</SubmitButton> : null}
      <p className="hint -mt-1 w-full max-w-2xl">
        За всё время, страницы и обложка вместе. Меняется сразу и для тех, кто уже пользовался: подняли — у всех появились ещё запросы, опустили — у тех, кто уже потратил больше, бесплатные кончатся (купленные остаются).
        0 — бесплатных нет, только пакеты.
      </p>
      {state.error ? (
        <p className="w-full text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="w-full text-sm text-success" role="status">
          {state.ok}
        </p>
      ) : null}
    </form>
  );
}

/** Подарить клиенту запросы — в строке таблицы. */
export function GrantForm({ userId }: { userId: string }) {
  const [state, action] = useActionState<AiDesignerState, FormData>(grantCreditsAction, {});
  return (
    <form action={action} className="flex items-center gap-1.5">
      <input type="hidden" name="userId" value={userId} />
      <input name="count" type="number" inputMode="numeric" min={1} max={200} defaultValue={5} className="input w-16" aria-label="Сколько запросов подарить" />
      <SubmitButton className="btn-outline btn-sm">Подарить</SubmitButton>
      {state.ok ? <span className="text-xs text-success">{state.ok}</span> : null}
      {state.error ? <span className="text-xs text-danger">{state.error}</span> : null}
    </form>
  );
}

const TIER_LABEL: Record<DesignModelTier, string> = { haiku: "Haiku — быстро и дёшево", sonnet: "Sonnet — баланс", opus: "Opus — самая сильная, дорого" };
const SCENARIO_LABEL: Record<DesignScenario, { title: string; note: string }> = {
  edit: { title: "Мелкая правка", note: "«шрифт покрупнее», «название золотым»" },
  draw: { title: "Правка с рисунком", note: "«нарисуй горы», «добавь орнамент» и длинные просьбы" },
  create: { title: "«Придумать»", note: "дизайн с нуля под книгу" },
  variants: { title: "«3 варианта»", note: "три обложки или три оформления страниц" },
  review: { title: "«Оценить»", note: "оценка и советы" },
};

/** Настройки ИИ-дизайнера: включён ли, модель по сценариям, осмотр картинкой, свои id моделей. */
export function DesignerSettingsForm({
  settings,
  hints,
  keyReady,
  canEdit,
}: {
  settings: DesignAiSettings;
  /** Средний расход на запрос по режиму за период — подсказка рядом с выбором модели. */
  hints: Partial<Record<DesignScenario, string>>;
  keyReady: boolean;
  canEdit: boolean;
}) {
  const [state, action] = useActionState<AiDesignerState, FormData>(saveDesignerSettingsAction, {});
  return (
    <form action={action} className="space-y-4" data-testid="ai-designer-settings">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="enabled" defaultChecked={settings.enabled} disabled={!canEdit} className="accent-wine" /> ИИ-дизайнер включён
        <span className={keyReady ? "badge badge-success" : "badge badge-danger"}>{keyReady ? "ключ Claude подключён" : "ключ Claude не задан — клиенты увидят «недоступен»"}</span>
      </label>
      <p className="-mt-2 text-xs text-muted">Выключатель только этого раздела: AI-помощник менеджеров и бот от него не зависят. Ключ Claude общий — вводится в «Интеграциях», блок «AI».</p>

      <div className="overflow-x-auto">
        <table className="table min-w-[640px] [&_td:first-child]:pl-0 [&_th:first-child]:pl-0">
          <thead>
            <tr>
              <th>Когда клиент просит</th>
              <th>Какая модель отвечает</th>
              <th>Расход за период</th>
            </tr>
          </thead>
          <tbody>
            {DESIGN_SCENARIOS.map((sc) => (
              <tr key={sc}>
                <td>
                  <div className="font-medium">{SCENARIO_LABEL[sc].title}</div>
                  <div className="text-xs text-muted">{SCENARIO_LABEL[sc].note}</div>
                </td>
                <td>
                  <select name={`tier_${sc}`} defaultValue={settings.tiers[sc]} disabled={!canEdit} className="input">
                    {DESIGN_MODEL_TIERS.map((t) => (
                      <option key={t} value={t}>
                        {TIER_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="text-xs text-muted">{hints[sc] ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Ориентир по цене одного запроса: Haiku — меньше цента, Sonnet — несколько центов, Opus — $0,15–0,50 (на «3 вариантах» рисуется три работы, да ещё осмотр картинкой). Клиент платит за запрос порядка 100–250 ₸ (около $0,2–0,5), поэтому Opus стоит включать
        точечно.
      </p>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="polish" defaultChecked={settings.polish} disabled={!canEdit} className="mt-0.5 accent-wine" />
        <span>
          Осмотр готовой работы картинкой
          <span className="block text-xs text-muted">Модель смотрит на получившуюся обложку или страницы и правит недостатки: качество заметно выше, но это ещё один запрос с картинкой на каждый ответ. У мелких правок на Haiku и у «Оценить» осмотра нет.</span>
        </span>
      </label>

      <details className="rounded-[var(--r-ctl)] border border-line p-3 text-sm">
        <summary className="cursor-pointer font-medium">Идентификаторы моделей</summary>
        <p className="mt-2 text-xs text-muted">Пусто — по умолчанию. Заполняйте, когда у Anthropic вышла новая модель этого уровня.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {DESIGN_MODEL_TIERS.map((t) => (
            <label key={t} className="block">
              <span className="label">{t === "haiku" ? "Haiku" : t === "sonnet" ? "Sonnet" : "Opus"} (по умолчанию {DESIGN_MODELS[t]})</span>
              <input name={`model_${t}`} defaultValue={settings.models[t] === DESIGN_MODELS[t] ? "" : settings.models[t]} placeholder={DESIGN_MODELS[t]} disabled={!canEdit} className="input" maxLength={80} />
            </label>
          ))}
        </div>
      </details>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <SubmitButton className="btn-dark">Сохранить настройки</SubmitButton>
          {state.ok ? <span className="text-sm text-success">{state.ok}</span> : null}
          {state.error ? <span className="text-sm text-danger">{state.error}</span> : null}
        </div>
      ) : null}
    </form>
  );
}
