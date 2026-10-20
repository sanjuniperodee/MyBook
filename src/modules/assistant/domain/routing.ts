/**
 * Маршрутизация модели AI-продажника: основная модель — всегда Claude (Anthropic API) одного из трёх уровней, остальные
 * провайдеры — только запасные (если Claude недоступен или не подключён). Уровень хода выбирает бот по признакам
 * сложности (messaging/domain/botRoute.ts); здесь — уровни, модели по умолчанию, единый прайс и политика из настроек.
 * Чистые функции.
 */

/** Уровни Claude: Haiku — основной поток, Sonnet — средняя сложность, Opus — редкие сложные исключения. */
export const SELLER_TIERS = ["haiku", "sonnet", "opus"] as const;
export type SellerTier = (typeof SELLER_TIERS)[number];
export const isSellerTier = (v: unknown): v is SellerTier => typeof v === "string" && (SELLER_TIERS as readonly string[]).includes(v);

/** Модели уровней по умолчанию (меняются в «Интеграциях» или переменными AI_MODEL_HAIKU / _SONNET / _OPUS). */
export const DEFAULT_TIER_MODELS: Record<SellerTier, string> = {
  haiku: "claude-haiku-5-5",
  sonnet: "claude-sonnet-5-5",
  opus: "claude-opus-5-5",
};

/** Цена модели в долларах за миллион токенов: обычный вход, выход, чтение из кэша и запись в кэш (TTL 1 час). */
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/**
 * Прайс по умолчанию — страница Pricing Anthropic API (сверено 20.10.2026; Haiku 5.5 — до 100K токенов запроса, а у
 * продажника запрос в разы меньше). Чтение кэша: 0.1× входа у Haiku, 0.05× у Sonnet 5.5 и Opus 5.5. Запись в кэш на
 * час — 2× входа (продажник кэширует стабильную часть инструкции на час). Единственное место с ценами в коде: актуальные
 * значения задаются настройкой seller.route.prices (JSON), она перекрывает эти.
 */
export const DEFAULT_PRICES: Record<string, ModelPrice> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 4 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 8 },
};

/** Токены одного запроса: input — без кэша (у Anthropic input_tokens — только некэшированный остаток). */
export interface TokenUsage {
  input: number;
  /** Выход вместе с рассуждением (рассуждение тарифицируется как выход). */
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  /** Из output — токены рассуждения (adaptive thinking); 0 — не рассуждала или провайдер не сообщил. */
  thinking?: number;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

/** Прайс из настройки (JSON { "модель": { input, output, cacheRead?, cacheWrite? } }) поверх цен по умолчанию; испорченный — по умолчанию. */
export function parsePrices(raw: string | null | undefined): Record<string, ModelPrice> {
  const out: Record<string, ModelPrice> = { ...DEFAULT_PRICES };
  if (!raw?.trim()) return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return out;
  for (const [model, p] of Object.entries(parsed as Record<string, unknown>)) {
    if (!p || typeof p !== "object") continue;
    const r = p as Record<string, unknown>;
    const input = num(r.input);
    const output = num(r.output);
    if (input === null || output === null) continue;
    // Без цен кэша — по обычным множителям Anthropic: чтение 0.1× входа, запись на час 2×.
    const round = (n: number) => Math.round(n * 1e6) / 1e6;
    out[model] = { input, output, cacheRead: num(r.cacheRead) ?? round(input * 0.1), cacheWrite: num(r.cacheWrite) ?? round(input * 2) };
  }
  return out;
}

/**
 * Стоимость запроса в долларах по прайсу; null — модели нет в прайсе (запасной провайдер без цены): такие запросы
 * считаются в метриках по токенам, но не в деньгах.
 */
export function costUsd(usage: TokenUsage, model: string, prices: Record<string, ModelPrice>): number | null {
  const p = prices[model];
  if (!p) return null;
  const usd = (usage.input * p.input + usage.output * p.output + (usage.cacheRead ?? 0) * p.cacheRead + (usage.cacheWrite ?? 0) * p.cacheWrite) / 1_000_000;
  return Math.round(usd * 1e8) / 1e8;
}

/**
 * Режим маршрутизации: on — Claude по уровням (основной поток Haiku), shadow — всегда модель по умолчанию, а выбранный
 * уровень только пишется в след и метрики (без лишних запросов), off — как раньше: одна модель продажника из
 * «Интеграций» (seller.provider / seller.model), без запасных.
 */
export type RouteMode = "on" | "shadow" | "off";

export interface RoutePolicy {
  mode: RouteMode;
  models: Record<SellerTier, string>;
  /** Уровень, когда бот его не назвал (и всегда — в режиме shadow). */
  defaultTier: SellerTier;
  /** Какие старшие уровни включены: Sonnet и Opus можно выключить ради экономии — ход тогда идёт на ближайший уровень ниже. */
  tiers: { sonnet: boolean; opus: boolean };
  /**
   * Глубина рассуждения по уровням (output_config.effort): рассуждение тарифицируется как выход (5× входа). medium —
   * по умолчанию; low — дешевле и быстрее, но это обмен качества на цену: включать после проверки на своих беседах.
   */
  effort: Record<SellerTier, SellerEffort>;
  /** Порог очков сложности для Sonnet и для Opus (признаки — messaging/domain/botRoute.ts). */
  sonnetAt: number;
  opusAt: number;
  /** Сколько дополнительных запросов-эскалаций можно за один ход клиента. */
  maxExtra: number;
  /**
   * Потолок расходов на одну беседу (по умолчанию $0.50 — защита от клиента, который пишет «сложно» ради Opus) и на сутки,
   * долларов; null — без потолка («0» в настройке). На потолке — только Haiku, без эскалаций.
   */
  budgetUsd: number | null;
  dailyBudgetUsd: number | null;
  prices: Record<string, ModelPrice>;
}

/** Ключи настроек политики (workspace settingDefs) и их значения → политика. Неверное значение — по умолчанию. */
export const ROUTE_SETTING_KEYS = [
  "seller.route",
  "seller.route.haiku",
  "seller.route.sonnet",
  "seller.route.opus",
  "seller.route.default",
  "seller.route.sonnetEnabled",
  "seller.route.opusEnabled",
  "seller.route.effort.haiku",
  "seller.route.effort.sonnet",
  "seller.route.effort.opus",
  "seller.route.sonnetAt",
  "seller.route.opusAt",
  "seller.route.maxExtra",
  "seller.route.budget",
  "seller.route.dailyBudget",
  "seller.route.prices",
] as const;
export type RouteSettingKey = (typeof ROUTE_SETTING_KEYS)[number];

const int = (v: string | undefined, def: number, min: number, max: number) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
/** Сумма в долларах: пусто — значение по умолчанию, 0 — без потолка. */
const money = (v: string | undefined, def: number | null = null) => {
  if (!v?.trim()) return def;
  const n = Number.parseFloat(v.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};
/** Потолок расходов на беседу по умолчанию, $: ~30 запросов Opus или тысячи ходов Haiku. */
export const DEFAULT_DIALOG_BUDGET_USD = 0.5;

export function readRoutePolicy(v: Partial<Record<RouteSettingKey, string>>): RoutePolicy {
  const mode = v["seller.route"];
  const tiers = { sonnet: v["seller.route.sonnetEnabled"] !== "off", opus: v["seller.route.opusEnabled"] !== "off" };
  const def = allowedTier(isSellerTier(v["seller.route.default"]) ? v["seller.route.default"] : "haiku", tiers);
  const sonnetAt = int(v["seller.route.sonnetAt"], 2, 1, 20);
  return {
    mode: mode === "off" || mode === "shadow" ? mode : "on",
    models: {
      haiku: v["seller.route.haiku"]?.trim() || DEFAULT_TIER_MODELS.haiku,
      sonnet: v["seller.route.sonnet"]?.trim() || DEFAULT_TIER_MODELS.sonnet,
      opus: v["seller.route.opus"]?.trim() || DEFAULT_TIER_MODELS.opus,
    },
    defaultTier: def,
    tiers,
    effort: { haiku: effortOf(v["seller.route.effort.haiku"]), sonnet: effortOf(v["seller.route.effort.sonnet"]), opus: effortOf(v["seller.route.effort.opus"]) },
    sonnetAt,
    opusAt: Math.max(sonnetAt + 1, int(v["seller.route.opusAt"], 6, 2, 30)),
    maxExtra: int(v["seller.route.maxExtra"], 2, 0, 4),
    budgetUsd: money(v["seller.route.budget"], DEFAULT_DIALOG_BUDGET_USD),
    dailyBudgetUsd: money(v["seller.route.dailyBudget"]),
    prices: parsePrices(v["seller.route.prices"]),
  };
}

/**
 * Почему запрос не удался — по нему решается, что дальше: повторить ту же модель после паузы (временный сбой), перейти
 * к запасной (таймаут, недоступность, нет ключа), подняться на уровень выше (отказ Haiku) или отдать ошибку боту
 * (переполнено окно контекста — бот сократит переписку).
 */
export const FAILURE_KINDS = ["rate_limit", "overloaded", "server", "connection", "timeout", "context", "refused", "auth", "not_found", "bad_request", "empty", "not_configured"] as const;
export type FailureKind = (typeof FAILURE_KINDS)[number];
export const isFailureKind = (v: unknown): v is FailureKind => typeof v === "string" && (FAILURE_KINDS as readonly string[]).includes(v);

/** Временные сбои, для которых имеет смысл одна повторная попытка той же модели после паузы. */
export const isTransient = (k: FailureKind) => k === "rate_limit" || k === "overloaded" || k === "server" || k === "connection";

/** Пауза перед повтором: заголовок retry-after (если короткий) или 1 с; дольше 3 с клиент в чате не ждёт — сразу к запасной. */
export function backoffMs(attempt: number, retryAfterSec: number | null = null): number | null {
  if (retryAfterSec !== null) return retryAfterSec <= 3 ? Math.max(250, retryAfterSec * 1000) : null;
  return Math.min(3000, 1000 * 2 ** attempt);
}

/** Глубина рассуждения: low | medium (по умолчанию). */
export type SellerEffort = "low" | "medium";
const effortOf = (v: string | undefined): SellerEffort => (v === "low" ? "low" : "medium");

/** Уровень с учётом выключенных: выключенный старший уровень заменяется ближайшим включённым ниже (Haiku включён всегда). */
export function allowedTier(tier: SellerTier, tiers: { sonnet: boolean; opus: boolean }): SellerTier {
  if (tier === "opus" && !tiers.opus) return tiers.sonnet ? "sonnet" : "haiku";
  if (tier === "sonnet" && !tiers.sonnet) return "haiku";
  return tier;
}

/** Модели Claude, у которых есть серверный резерв на случай отказа (fallbacks: "default"); у Haiku 5.5 его нет. */
export const supportsServerFallback = (model: string) => /^claude-(fable-5|mythos-5|opus-5|sonnet-5-5)/.test(model);
