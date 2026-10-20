import { allowedTier, backoffMs, costUsd, failureKindOf, isTransient, type AiConnection, type AiProvider, type FailureKind, type RouteMode, type RoutePolicy, type SellerTier } from "../domain";
import type { LanguageModel, Usage } from "./ports";

/**
 * Вложение для распознавания (base64): голосовое, картинка, PDF или документ Word/Excel/текст. kind и mime — по
 * фактическому содержимому файла (сигнатуре), а не по имени или расширению.
 */
export interface MediaPart {
  kind: "image" | "audio" | "pdf" | "document";
  data: string;
  mime: string;
}

/**
 * Итог распознавания: текст (и токены модели, если она считала, — в расходы беседы); «не умеет» (модель без vision или
 * аудио — больше не пробовать; файл не разобрать); null — временный сбой.
 */
export type MediaRecognition = { text: string; usage?: Usage; pages?: number; costUsd?: number | null } | { unsupported: true; reason?: string; bad?: boolean };

/** Какое подключение распознаёт вложение: голосовые — модель «Голосовые и фото», фото и PDF — Claude Vision (если включён). */
export type MediaConnectionFor = (kind: MediaPart["kind"]) => Promise<AiConnection & { enabled?: boolean }>;

/** Неудачная попытка запроса (для метрик: ошибки, повторы, переход к запасной модели). Без текста запроса и ответа. */
export interface SellerAttempt {
  provider: AiProvider;
  model: string;
  tier: SellerTier | null;
  kind: FailureKind;
  ms: number;
}

/** Кто ответил на запрос продажника и во что он обошёлся — в след хода и агрегированные метрики. */
export interface SellerServed {
  mode: RouteMode;
  provider: AiProvider;
  model: string;
  /** Уровень Claude, который ответил; null — запасной провайдер или режим off. */
  tier: SellerTier | null;
  /** Какой уровень просил бот (в режиме shadow он только записывается, отвечает модель по умолчанию). */
  wanted: SellerTier | null;
  /** Ответил запасной провайдер (Claude недоступен или не подключён). */
  fallback: boolean;
  usage: Required<Omit<Usage, "model">>;
  /** Стоимость по прайсу (seller.route.prices); null — модели нет в прайсе. */
  costUsd: number | null;
  ms: number;
  /** Неудачные попытки до ответа (повтор после паузы, отказ Haiku, запасной провайдер). */
  attempts: SellerAttempt[];
}

/** Ошибка запроса продажника: все маршруты не ответили; attempts — что пробовали (для следа хода и метрик). */
export type SellerCallError = Error & { kind?: FailureKind; attempts?: SellerAttempt[] };

/**
 * Модели AI-продажника по настройкам «Интеграций»: Claude по уровням (Anthropic — единственная основная), запасные
 * провайдеры и прежняя одна модель (режим off).
 */
export interface SellerRoute {
  policy(): Promise<RoutePolicy>;
  /** Claude с этой моделью (ключ и адрес — Anthropic из «Интеграций»). */
  claude(model: string): LanguageModel;
  /** Запасные провайдеры по порядку (без Anthropic) — пробуются, только если Claude не ответил. */
  fallbacks(): Promise<LanguageModel[]>;
  /** Прежняя одна модель продажника (seller.provider / seller.model) — режим off. */
  legacy: LanguageModel;
}

type Clock = { now(): number; sleep(ms: number): Promise<void> };
const realClock: Clock = { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

/** Меньше этого на запрос не остаётся — следующую попытку не начинаем: клиент ждёт в чате. */
const MIN_CALL_MS = 3_000;

type Request = { system: string; user: string; schema: Record<string, unknown>; timeoutMs: number; cachePrefix?: string; tier?: SellerTier };

/**
 * Модель AI-продажника: один запрос со схемой JSON. Таймаут короткий (клиент ждёт в чате); повтор и запасной путь хода
 * решает бот, а здесь — маршрут одного запроса: Claude уровня, который назвал бот (по умолчанию Haiku) → одна повторная
 * попытка после паузы, если сбой временный (429, 529, 5xx, сеть) → отказ Haiku поднимает запрос на Sonnet (у Haiku нет
 * серверного резерва) → запасные провайдеры по порядку. Всё — в пределах полутора таймаутов: дольше клиент не ждёт.
 * Переполнение окна контекста не обходится запасными: бот повторит с сокращённой перепиской.
 * Вложения (голосовые, фото) распознаёт своё подключение («Интеграции» → AI → «Голосовые и фото»).
 */
export function sellerModel(
  route: SellerRoute,
  mediaConnection: MediaConnectionFor,
  media: (c: AiConnection & { enabled?: boolean }, input: { system: string; parts: MediaPart[]; timeoutMs: number }) => Promise<MediaRecognition | null>,
  clock: Clock = realClock,
) {
  async function candidates(policy: RoutePolicy, tier: SellerTier): Promise<{ model: LanguageModel; tier: SellerTier | null; fallback: boolean }[]> {
    if (policy.mode === "off") return [{ model: route.legacy, tier: null, fallback: false }];
    return [{ model: route.claude(policy.models[tier]), tier, fallback: false }, ...(await route.fallbacks()).map((model) => ({ model, tier: null, fallback: true }))];
  }

  async function complete(input: Request): Promise<{ text: string; usage: { input: number; output: number }; served: SellerServed }> {
    const policy = await route.policy();
    const started = clock.now();
    const deadline = started + input.timeoutMs * 1.5;
    // Выключенный в настройках уровень (Sonnet, Opus) не вызывается: запрос идёт на ближайший включённый ниже.
    const wanted = policy.mode === "off" ? null : allowedTier(input.tier ?? policy.defaultTier, policy.tiers);
    const queue = await candidates(policy, policy.mode === "on" ? wanted! : policy.defaultTier);
    const attempts: SellerAttempt[] = [];
    let last: unknown = null;
    let escalated = false;
    for (let i = 0; i < queue.length; i++) {
      const c = queue[i];
      const who = await c.model.describe();
      if (!(await c.model.configured().catch(() => false))) {
        if (c.tier) attempts.push({ provider: who.provider, model: who.model, tier: c.tier, kind: "not_configured", ms: 0 });
        continue;
      }
      for (let retry = 0; ; retry++) {
        const left = deadline - clock.now();
        if (left < MIN_CALL_MS) throw failure(last, attempts);
        const t0 = clock.now();
        try {
          // Глубина рассуждения — по уровню из настроек (запасной провайдер и режим off — medium, как раньше).
          const res = await c.model.ask({ system: input.system, user: input.user, effort: c.tier ? policy.effort[c.tier] : "medium", ...(c.tier ? { cacheTtl: policy.cacheTtl[c.tier] } : {}), schema: input.schema, timeoutMs: Math.min(input.timeoutMs, left), cachePrefix: input.cachePrefix });
          const usage = { input: res.usage.input, output: res.usage.output, cacheRead: res.usage.cacheRead ?? 0, cacheWrite: res.usage.cacheWrite ?? 0, thinking: res.usage.thinking ?? 0 };
          const model = res.usage.model || who.model;
          const served: SellerServed = { mode: policy.mode, provider: who.provider, model, tier: c.tier, wanted, fallback: c.fallback, usage, costUsd: costUsd(usage, model, policy.prices, c.tier ? policy.cacheTtl[c.tier] : "1h"), ms: clock.now() - t0, attempts };
          return { text: res.text, usage: { input: usage.input, output: usage.output }, served };
        } catch (err) {
          last = err;
          const kind = failureKindOf(err);
          attempts.push({ provider: who.provider, model: who.model, tier: c.tier, kind, ms: clock.now() - t0 });
          if (kind === "context") throw failure(err, attempts);
          if (isTransient(kind) && retry === 0) {
            const wait = backoffMs(0, retryAfterOf(err));
            if (wait !== null && clock.now() + wait + MIN_CALL_MS < deadline) {
              await clock.sleep(wait);
              continue;
            }
          }
          // Haiku отказался (у него нет серверного резерва) — один раз тот же запрос на Sonnet (или Opus, если Sonnet
          // выключен), до запасных провайдеров.
          const up = policy.tiers.sonnet ? "sonnet" : policy.tiers.opus ? "opus" : null;
          if (kind === "refused" && c.tier === "haiku" && up && policy.mode === "on" && !escalated) {
            escalated = true;
            queue.splice(i + 1, 0, { model: route.claude(policy.models[up]), tier: up, fallback: false });
          }
          break;
        }
      }
    }
    throw failure(last, attempts);
  }

  return {
    /** Есть ли чем отвечать: Claude или хотя бы один запасной провайдер (в режиме off — прежняя модель). */
    async configured() {
      const policy = await route.policy();
      if (policy.mode === "off") return route.legacy.configured();
      if (await route.claude(policy.models[policy.defaultTier]).configured()) return true;
      for (const m of await route.fallbacks()) if (await m.configured().catch(() => false)) return true;
      return false;
    },
    /** Для подписей в «Интеграциях»: уровни Claude или, без ключа Claude, первая запасная модель. */
    async describe(): Promise<{ provider: AiProvider; label: string; model: string }> {
      const policy = await route.policy();
      if (policy.mode === "off") return route.legacy.describe();
      const claude = route.claude(policy.models[policy.defaultTier]);
      if (!(await claude.configured())) {
        for (const m of await route.fallbacks()) if (await m.configured().catch(() => false)) return m.describe();
      }
      return { provider: "anthropic", label: "Claude", model: policy.mode === "shadow" ? policy.models[policy.defaultTier] : `${policy.models.haiku} / ${policy.models.sonnet} / ${policy.models.opus}` };
    },
    /** Политика маршрутизации — боту: пороги, лимит эскалаций, потолки расходов, режим. */
    policy: () => route.policy(),
    /** Текст ответа, токены и кто ответил (они идут в след хода бота: «Почему так?», и в метрики расходов). */
    complete,
    /** Распознать вложение; стоимость запроса к модели (если она сообщила токены) — по прайсу маршрутизации. */
    async media(input: { system: string; parts: MediaPart[]; timeoutMs: number }): Promise<MediaRecognition | null> {
      const res = await media(await mediaConnection(input.parts[0]?.kind ?? "image"), input);
      if (!res || !("text" in res) || !res.usage) return res;
      const usage = { input: res.usage.input, output: res.usage.output, cacheRead: res.usage.cacheRead ?? 0, cacheWrite: res.usage.cacheWrite ?? 0 };
      return { ...res, costUsd: res.usage.model ? costUsd(usage, res.usage.model, (await route.policy()).prices) : null };
    },
  };
}

/** retry-after провайдера (params[1] ошибки), если он есть. */
function retryAfterOf(err: unknown): number | null {
  const v = (err as { params?: readonly unknown[] })?.params?.[1];
  return typeof v === "number" ? v : null;
}

/** Последняя ошибка с видом сбоя и всеми попытками; ни одной попытки (ничего не подключено) — «не подключено». */
function failure(last: unknown, attempts: SellerAttempt[]): SellerCallError {
  const err: SellerCallError = last instanceof Error ? last : new Error("AI-продажник не подключён: нет ключа Claude и запасных провайдеров.");
  err.kind = last ? failureKindOf(last) : "not_configured";
  err.attempts = attempts;
  return err;
}
