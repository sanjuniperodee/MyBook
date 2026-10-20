/**
 * Статистика бота в настройках: почему беседа ушла менеджеру. Причины передачи пишут оба бота — шаблонный (call,
 * manager, paid…) и AI-продажник (call_request, human_request, price_request…), а часть причин — не просьба клиента,
 * а сбой самого бота: модель не ответила, повтор по кругу, потолок беседы. Сбои показываются отдельно, чтобы не
 * выглядеть вопросами клиентов. Чистые функции.
 */

/** Причины передачи, которые означают сбой бота: модель не ответила, петля, потолок беседы, дважды не прошёл проверку, голосовое не распознано. */
export const BOT_FAILURE_REASONS = ["ai_error", "loop", "limit", "ai_blocked", "voice"] as const;
export type BotFailureReason = (typeof BOT_FAILURE_REASONS)[number];

export const isBotFailure = (reason: string): reason is BotFailureReason => (BOT_FAILURE_REASONS as readonly string[]).includes(reason);

/** Подписи причин передачи менеджеру (синонимы шаблонного бота и продажника — одной подписью). */
export const handoffReasonLabels: Record<string, string> = {
  call: "просили позвонить",
  call_request: "просили позвонить",
  manager: "просили менеджера",
  human_request: "просили менеджера",
  paid: "сообщили об оплате",
  paid_claim: "сообщили об оплате",
  pay: "хотели оплатить",
  payment_issue: "проблема с оплатой или заказом",
  complaint: "жалоба",
  custom_request: "нестандартная просьба",
  media: "прислали фото или файл",
  file_received: "прислали фото или файл",
  objection: "возражения после вариантов",
  price_request: "цену называет менеджер",
  agreed: "согласились — нужен счёт",
  question: "бот не знал ответа",
  unsure: "бот не знал ответа",
  unanswered: "модель промолчала на вопрос",
};

/** Подписи сбоев. */
export const failureReasonLabels: Record<BotFailureReason, string> = {
  ai_error: "модель не ответила дважды",
  loop: "бот повторил своё сообщение (по кругу)",
  limit: "потолок беседы",
  ai_blocked: "ответ модели дважды не прошёл проверку",
  voice: "голосовое не распознано",
};

/** Передачи менеджеру по причинам → обычные причины и сбои. */
export function splitHandoffs(tally: Record<string, number>): { handoffs: Record<string, number>; failures: Record<string, number> } {
  const handoffs: Record<string, number> = {};
  const failures: Record<string, number> = {};
  for (const [reason, n] of Object.entries(tally)) (isBotFailure(reason) ? failures : handoffs)[reason] = n;
  return { handoffs, failures };
}

/** Счётчики по подписям, по убыванию: синонимы («call» и «call_request») — одной строкой; причина без подписи — как есть. */
export function byLabel(tally: Record<string, number>, labels: Record<string, string>): [string, number][] {
  const out = new Map<string, number>();
  for (const [key, n] of Object.entries(tally)) {
    const label = labels[key] ?? key;
    out.set(label, (out.get(label) ?? 0) + n);
  }
  return [...out].sort((a, b) => b[1] - a[1]);
}

/** Строка агрегата по запросам к модели (журнал следов ходов): провайдер, модель, уровень и суммы. */
export interface LlmCallRow {
  tier: string | null;
  provider: string | null;
  model: string | null;
  calls: number;
  failed: number;
  fallback: number;
  retries: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** Токены рассуждения (входят в выход). */
  thinking?: number;
  costUsd: number;
  avgMs: number | null;
}

/** Строка агрегата по ходам: какой уровень выбрал код (chosen) и какой ответил (final; null — запасной или off). */
export interface LlmTurnRow {
  chosen: string | null;
  final: string | null;
  mode: string | null;
  turns: number;
  escalations: number;
  costUsd: number;
}

/** Метрики модели продажника за период: доли уровней, эскалации, токены, расходы на 1 000 ходов, сбои и запасные. */
export interface LlmMetrics {
  turns: number;
  /** Кто фактически ответил на ход: haiku / sonnet / opus / fallback (запасной провайдер или режим off). */
  answered: Record<string, number>;
  /** Какой уровень выбрал код (в режиме shadow — что выбрал бы). */
  chosen: Record<string, number>;
  escalations: number;
  costUsd: number;
  /** Стоимость 1 000 ходов (сообщений бота клиенту и напоминаний), $; null — ходов не было. */
  costPer1000: number | null;
  calls: number;
  failed: number;
  fallback: number;
  retries: number;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; thinking: number };
  /** Доля входа, прочитанная из кэша (здоровый уровень — от 80%); null — входа не было. */
  cacheShare: number | null;
  /** Доля выхода, которая ушла на рассуждение; null — выхода не было. */
  thinkingShare: number | null;
  /** Расходы по уровням (кто ответил): haiku / sonnet / opus / fallback. */
  costByTier: Record<string, number>;
  /** Эскалации по причинам (invalid — не по схеме, rejected — не прошёл проверку, unsure — не уверен, error — сбой) и куда. */
  escalationCauses?: Record<string, number>;
  /** Срок кэша по уровням: прогон по моментам вызовов (см. cacheTtlAdvice). */
  cacheTtl?: Record<string, { calls: number; cost5m: number; cost1h: number; ratio: number | null }>;
  /** По моделям: запросы, токены, стоимость, средняя задержка — по убыванию стоимости. */
  models: { model: string; provider: string; tier: string | null; calls: number; failed: number; costUsd: number; avgMs: number | null }[];
}

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Сводка метрик модели из агрегатов журнала. Чистая функция. */
export function llmMetrics(turns: LlmTurnRow[], calls: LlmCallRow[]): LlmMetrics {
  const answered: Record<string, number> = {};
  const chosen: Record<string, number> = {};
  let n = 0;
  let escalations = 0;
  let cost = 0;
  for (const t of turns) {
    n += t.turns;
    escalations += t.escalations;
    cost += t.costUsd;
    const who = t.final ?? "fallback";
    answered[who] = (answered[who] ?? 0) + t.turns;
    if (t.chosen) chosen[t.chosen] = (chosen[t.chosen] ?? 0) + t.turns;
  }
  const sum = (k: "calls" | "failed" | "fallback" | "retries" | "input" | "output" | "cacheRead" | "cacheWrite" | "thinking") => calls.reduce((s, c) => s + (c[k] ?? 0), 0);
  const costByTier: Record<string, number> = {};
  for (const c of calls) costByTier[c.tier ?? "fallback"] = r6((costByTier[c.tier ?? "fallback"] ?? 0) + c.costUsd);
  const allInput = sum("input") + sum("cacheRead") + sum("cacheWrite");
  const models = calls
    .filter((c) => c.model)
    .map((c) => ({ model: c.model!, provider: c.provider ?? "", tier: c.tier, calls: c.calls, failed: c.failed, costUsd: r6(c.costUsd), avgMs: c.avgMs === null ? null : Math.round(c.avgMs) }))
    .sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls);
  return {
    turns: n,
    answered,
    chosen,
    escalations,
    costUsd: r6(cost),
    costPer1000: n ? r6((cost / n) * 1000) : null,
    calls: sum("calls"),
    failed: sum("failed"),
    fallback: sum("fallback"),
    retries: sum("retries"),
    tokens: { input: sum("input"), output: sum("output"), cacheRead: sum("cacheRead"), cacheWrite: sum("cacheWrite"), thinking: sum("thinking") },
    cacheShare: allInput ? Math.round((sum("cacheRead") / allInput) * 1000) / 1000 : null,
    thinkingShare: sum("output") ? Math.round((sum("thinking") / sum("output")) * 1000) / 1000 : null,
    costByTier,
    models,
  };
}

/** Стоимость кэша стабильной инструкции в «префиксах»: запись на 5 минут — 1.25, на час — 2; чтение — доля входа уровня. */
const CACHE_READ: Record<string, number> = { haiku: 0.1, sonnet: 0.05, opus: 0.05 };

/**
 * Какой срок кэша дешевле на этом трафике: прогон по реальным моментам вызовов уровня (обращение в пределах срока —
 * чтение и продление, иначе — новая запись). Варианты стабильной части не различаются — это оценка. ratio — во сколько
 * раз кэш на 5 минут дороже часового (меньше 1 — дешевле).
 */
export function cacheTtlAdvice(times: number[], tier: string): { calls: number; cost5m: number; cost1h: number; ratio: number | null } {
  const read = CACHE_READ[tier] ?? 0.1;
  const sorted = [...times].sort((a, b) => a - b);
  const walk = (ttlMs: number, write: number) => {
    let last = -Infinity;
    let cost = 0;
    for (const t of sorted) {
      cost += t - last <= ttlMs ? read : write;
      last = t;
    }
    return cost;
  };
  const cost5m = walk(5 * 60_000, 1.25);
  const cost1h = walk(60 * 60_000, 2);
  return { calls: sorted.length, cost5m: Math.round(cost5m * 100) / 100, cost1h: Math.round(cost1h * 100) / 100, ratio: cost1h ? Math.round((cost5m / cost1h) * 100) / 100 : null };
}
