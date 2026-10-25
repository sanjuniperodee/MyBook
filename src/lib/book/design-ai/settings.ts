/**
 * Настройки ИИ-дизайнера из админки: включён ли он, какая модель отвечает в каком сценарии и смотрит ли модель на готовую
 * работу картинкой. Чистые функции — значения приходят строками из настроек CRM (страница «ИИ-дизайнер»).
 */
import type { DesignMode } from "./prompts";

/** Уровень модели Claude. */
export type DesignModelTier = "haiku" | "sonnet" | "opus";
export const DESIGN_MODEL_TIERS: readonly DesignModelTier[] = ["haiku", "sonnet", "opus"];

/** Модели Claude по уровням по умолчанию (можно заменить id в настройках — когда выйдет новая модель). */
export const DESIGN_MODELS: Record<DesignModelTier, string> = { haiku: "claude-haiku-5-5", sonnet: "claude-sonnet-5-5", opus: "claude-opus-5-5" };

/** Модель для мелких правок и точка отсчёта для тестов. */
export const DESIGN_AI_MODEL = DESIGN_MODELS.haiku;

/**
 * Сценарии просьбы — по ним выбирается модель: мелкая правка («шрифт покрупнее»), правка с рисунком или длинной просьбой,
 * «Придумать», «3 варианта», «Оценить».
 */
export const DESIGN_SCENARIOS = ["edit", "draw", "create", "variants", "review"] as const;
export type DesignScenario = (typeof DESIGN_SCENARIOS)[number];

/** Просьба о рисунке или «придумай»: такие правки лёгкая модель делает хуже. */
const CREATIVE_ASK = /нарису|рису|рисова|иллюстрац|эмблем|логотип|орнамент|узор|пейзаж|придума|с нуля|заново|удиви|креатив|необычн|эксклюзив|мотив|юрт|тюльпан|горы|горн|гору|звёзд|звезд|солнц|луна|луну|картин|өрнек|сурет|ою/i;

export function designScenario(mode: DesignMode, prompt: string): DesignScenario {
  if (mode === "create" || mode === "variants" || mode === "review") return mode;
  return prompt.length > 160 || CREATIVE_ASK.test(prompt) ? "draw" : "edit";
}

/**
 * Уровни по умолчанию. Opus — только по выбору: запрос «3 варианта» на нём обходится в $0,17–0,50 (рисуется три обложки,
 * плюс осмотр картинкой), а клиент платит порядка 100–250 ₸ за запрос; на Sonnet тот же запрос в несколько раз дешевле.
 */
export const DEFAULT_DESIGN_TIERS: Record<DesignScenario, DesignModelTier> = { edit: "haiku", draw: "sonnet", create: "sonnet", variants: "sonnet", review: "sonnet" };

export interface DesignAiSettings {
  /** Выключен — клиенты видят «ИИ-дизайнер недоступен». */
  enabled: boolean;
  tiers: Record<DesignScenario, DesignModelTier>;
  models: Record<DesignModelTier, string>;
  /** Осмотр готовой работы картинкой (дополнительный запрос) для «Придумать», «3 варианта» и сложных правок. */
  polish: boolean;
}

/** Ключи настроек CRM. */
export const DESIGN_SETTING_KEYS = [
  "designAi.enabled",
  "designAi.tier.edit",
  "designAi.tier.draw",
  "designAi.tier.create",
  "designAi.tier.variants",
  "designAi.tier.review",
  "designAi.model.haiku",
  "designAi.model.sonnet",
  "designAi.model.opus",
  "designAi.polish",
] as const;
export type DesignSettingKey = (typeof DESIGN_SETTING_KEYS)[number];

const tierOf = (v: string | undefined, fallback: DesignModelTier): DesignModelTier => (DESIGN_MODEL_TIERS.includes(v as DesignModelTier) ? (v as DesignModelTier) : fallback);
const modelId = (v: string | undefined, fallback: string) => (v && /^[\w.:/-]{3,80}$/.test(v.trim()) ? v.trim() : fallback);

/** Значения настроек → настройки дизайнера; пустое и мусор — по умолчанию. */
export function parseDesignAiSettings(v: Partial<Record<DesignSettingKey, string>>): DesignAiSettings {
  return {
    enabled: v["designAi.enabled"] !== "off",
    tiers: Object.fromEntries(DESIGN_SCENARIOS.map((s) => [s, tierOf(v[`designAi.tier.${s}`], DEFAULT_DESIGN_TIERS[s])])) as Record<DesignScenario, DesignModelTier>,
    models: Object.fromEntries(DESIGN_MODEL_TIERS.map((t) => [t, modelId(v[`designAi.model.${t}`], DESIGN_MODELS[t])])) as Record<DesignModelTier, string>,
    polish: v["designAi.polish"] !== "off",
  };
}

/** Какая модель отвечает на просьбу и нужен ли осмотр картинкой. Осмотра нет у мелких правок на Haiku и у оценки. */
export function designPlan(settings: DesignAiSettings, mode: DesignMode, prompt: string): { scenario: DesignScenario; tier: DesignModelTier; model: string; polish: boolean } {
  const scenario = designScenario(mode, prompt);
  const tier = settings.tiers[scenario];
  return { scenario, tier, model: settings.models[tier], polish: settings.polish && scenario !== "review" && tier !== "haiku" };
}
