/**
 * «ИИ ведёт этапы» (настройка crm.aiStages): модель читает свежую переписку сделки и говорит, где сделка на самом деле.
 * Здесь — настройка, роли этапов для модели и правило, что ИИ делает сам, а что только предлагает менеджеру.
 * Без базы и сети — для сервера, страницы настроек и тестов.
 */
import { parseStageOrder, type StageOrderConfig } from "./stageOrder";

export interface AiStagesConfig {
  on: boolean;
}

export function parseAiStages(raw: string | null | undefined): AiStagesConfig {
  try {
    const v: unknown = JSON.parse(raw || "{}");
    return { on: !!v && typeof v === "object" && (v as Record<string, unknown>).on === true };
  } catch {
    return { on: false };
  }
}

/** Пороги и лимиты прохода. Уверенность — то, что вернула модель (0–1). */
export const AI_STAGES = {
  /** Сделок за проход (раз в минуту) и в сутки: внешний API — не больше этого. */
  batch: 3,
  perDay: 300,
  /** Разбираем переписку, когда она затихла: последнее сообщение не новее стольких минут. */
  quietMinutes: 15,
  /** И не старше стольких дней: давнюю переписку разбирает «Порядок в воронке» по молчанию. */
  lookbackDays: 7,
  /** С этой уверенности ИИ меняет этап сам (если переход безопасный), с propose — предлагает менеджеру. */
  apply: 0.85,
  propose: 0.6,
  /** Сообщений переписки, которые видит модель (последние). */
  messages: 60,
} as const;

/**
 * Роль этапа в воронке — по настройкам, а не по названию (этапы переименовывают): первый открытый — новая заявка;
 * «в работе», «не отвечает», «оплачено» — из «Порядка в воронке»; этап с вехой сайта — веха; успех и отказ — по виду.
 */
export type AiStageRole = "entry" | "work" | "silent" | "paid" | "milestone" | "open" | "won" | "lost";

export interface AiStageOption {
  id: string;
  name: string;
  kind: "open" | "won" | "lost";
  position: number;
  milestone: string | null;
  role: AiStageRole;
}

export function stageRoles(stages: readonly { id: string; name: string; kind: "open" | "won" | "lost"; position: number; milestone: string | null }[], stageOrderRaw: string | null | undefined): AiStageOption[] {
  const order: StageOrderConfig = parseStageOrder(stageOrderRaw);
  const sorted = [...stages].sort((a, b) => a.position - b.position);
  const entry = sorted.find((s) => s.kind === "open")?.id;
  return sorted.map((s) => ({
    ...s,
    role:
      s.kind !== "open"
        ? s.kind
        : s.id === entry
          ? "entry"
          : s.id === order.workStageId
            ? "work"
            : s.id === order.silentStageId
              ? "silent"
              : s.id === order.paidStageId
                ? "paid"
                : s.milestone
                  ? "milestone"
                  : "open",
  }));
}

/** Этапы «разговора»: между ними ИИ двигает сам — за ними не стоят ни деньги, ни события на сайте. */
const TALK: readonly AiStageRole[] = ["entry", "work", "silent", "open"];

export interface AiStageInput {
  current: AiStageOption;
  target: AiStageOption | null;
  confidence: number;
  /** Цитата дословно найдена в названном сообщении переписки. */
  quoteOk: boolean;
  /** Цитата — из сообщения клиента (отказ ИИ ставит сам только по словам клиента). */
  quoteFromClient: boolean;
  lostReason: string | null;
  /** Сколько дней клиент молчит (по последнему его сообщению) и через сколько дней молчания «не отвечает» по «Порядку в воронке». */
  silentFor: number;
  silentDays: number;
}

/**
 * Что делать с выводом модели: apply — сменить этап самому, propose — предложить менеджеру, null — ничего.
 * - Успех ставит только заказ на сайте: ИИ его не ставит и выигранные сделки не трогает.
 * - Без дословной цитаты из переписки ИИ ничего не делает: вывод нечем подтвердить.
 * - Отказ — сам, только по словам клиента, с причиной из списка и из этапов разговора; с этапов оплаты и книги (там
 *   деньги клиента) и по словам менеджера — предложение.
 * - Между этапами разговора (новая, в работе, не отвечает и свои этапы без вехи) — сам.
 * - «Не отвечает» — не раньше, чем клиент молчит столько дней, сколько ждёт «Порядок в воронке»: «подумаю» вчера — ещё
 *   разговор, менеджер должен напомнить о себе (правило «молчит после нашего ответа» смотрит на этап «в работе»).
 * - Шаг назад по воронке — только предложением и только при уверенности, как у самостоятельного шага.
 * - Деньги, книга на сайте (этапы с вехой) и возврат из отказа — только предложением: это проверяет человек.
 */
export function aiStageDecision(d: AiStageInput): "apply" | "propose" | null {
  const { current, target } = d;
  if (!target || target.id === current.id) return null;
  if (current.kind === "won" || target.kind === "won") return null;
  if (!d.quoteOk || d.confidence < AI_STAGES.propose) return null;
  const sure = d.confidence >= AI_STAGES.apply;
  if (target.kind === "lost") {
    if (!d.lostReason || current.kind !== "open") return null;
    // Сам — только из этапов разговора: на этапах оплаты и книги у сделки деньги клиента (живой разбор 27.11, Д748 с предоплатой).
    return sure && d.quoteFromClient && TALK.includes(current.role) ? "apply" : "propose";
  }
  if (current.kind === "lost") return "propose";
  if (target.role === "silent" && d.silentFor < d.silentDays) return null;
  if (TALK.includes(current.role) && TALK.includes(target.role)) return sure ? "apply" : "propose";
  if (target.position < current.position && !sure) return null;
  return "propose";
}

/** Сравнение цитаты с сообщением без учёта регистра, пробелов, кавычек и «ё». */
export function normalizeQuote(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"“”„'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Цитата есть в тексте сообщения (не короче 3 знаков). */
export function quoteIn(quote: string | null | undefined, text: string | null | undefined): boolean {
  const q = normalizeQuote(quote ?? "").replace(/[.…]+$/, "");
  return q.length >= 3 && normalizeQuote(text ?? "").includes(q);
}
