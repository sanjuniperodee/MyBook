/**
 * Выбор уровня модели для хода AI-продажника — без отдельного запроса к модели: по признакам сложности, которые код
 * видит сам (возражение, торг, сравнение вариантов, несколько условий сразу, противоречия, повтор нерешённого вопроса,
 * срок, деньги на кону, сбои в этой беседе). Haiku — основной поток (приветствие, FAQ, сбор данных, квалификация),
 * Sonnet — возражения, подбор и сравнение, неоднозначные и важные ходы, Opus — редкие исключения: много очков сложности
 * и хотя бы один «тяжёлый» признак (противоречие, много взаимосвязанных условий, вопрос не решён и после Sonnet).
 * Длина текста и недовольство сами по себе уровень не поднимают. Чистые функции; текст клиента никуда не записывается —
 * в след идут только коды признаков.
 */
import { norm, objectionKind, rx } from "./botNlu";
import type { DeadlineKind } from "./botEngine";
import type { SellerStage } from "./botSellerState";

export const ROUTE_TIERS = ["haiku", "sonnet", "opus"] as const;
export type RouteTier = (typeof ROUTE_TIERS)[number];
export const isRouteTier = (v: unknown): v is RouteTier => typeof v === "string" && (ROUTE_TIERS as readonly string[]).includes(v);
const rank = (t: RouteTier) => ROUTE_TIERS.indexOf(t);
export const maxTier = (a: RouteTier, b: RouteTier): RouteTier => (rank(a) >= rank(b) ? a : b);

/** Какие старшие уровни включены (Sonnet и Opus выключаются ради экономии); Haiku — всегда. */
export type RouteTiers = { sonnet: boolean; opus: boolean };
const ALL_TIERS: RouteTiers = { sonnet: true, opus: true };
const enabled = (t: RouteTier, tiers: RouteTiers) => t === "haiku" || tiers[t];

/** Выключенный уровень → ближайший включённый ниже. */
export function capTier(t: RouteTier, tiers: RouteTiers = ALL_TIERS): RouteTier {
  if (t === "opus" && !tiers.opus) return tiers.sonnet ? "sonnet" : "haiku";
  if (t === "sonnet" && !tiers.sonnet) return "haiku";
  return t;
}

/** Признак сложности хода (код — в след и метрики, без слов клиента). */
export const ROUTE_REASONS = [
  "price_objection",
  "later_objection",
  "repeat_objection",
  "discount",
  "compare",
  "constraints",
  "contradiction",
  "unresolved",
  "ambiguous",
  "deadline",
  "stakes",
  "prior_failure",
  "negotiation",
  "budget",
] as const;
export type RouteReason = (typeof ROUTE_REASONS)[number];

export interface RouteChoice {
  tier: RouteTier;
  score: number;
  reasons: RouteReason[];
  /** «Тяжёлый» признак: только с ним возможен Opus. */
  hard: boolean;
  /** Потолок расходов: только Haiku, без эскалаций. */
  capped: boolean;
}

export interface RouteInput {
  purpose: "reply" | "follow_up" | "copilot";
  /** Только оценка «ждёт ли клиент ответа» (copilot triage) — всегда базовый уровень. */
  quick?: boolean;
  /** Новые сообщения клиента в этом ходе. */
  clientText: string;
  /** Переписка по порядку (последние сообщения). */
  history: { from: "client" | "bot" | "manager"; text: string }[];
  ai: { objections: number; stage: SellerStage; blocked: number; failures: number; lastTier?: RouteTier | null };
  /** Вердикт кода по сроку к дате события. */
  deadline: DeadlineKind | null;
  policy: { defaultTier: RouteTier; sonnetAt: number; opusAt: number; tiers?: RouteTiers };
  overBudget?: boolean;
}

const DISCOUNT = rx(["\\bскидк", "\\bуступ", "\\bторг", "\\bсделайте\\s+дешевле", "\\bподешевле\\s+(?:можно|никак)", "\\bжеңілдік", "\\bжеңілдет", "\\bженилдик", "\\bарзандат"]);
const COMPARE = rx([
  "\\bчем\\s+отлича", "\\bв\\s+ч[её]м\\s+разниц", "\\bразниц", "\\bчто\\s+лучше", "\\bкак(?:ой|ая|ую|ое)\\s+лучше", "\\bчто\\s+выбрать", "\\bкак(?:ой|ую)\\s+выбрать", "\\bсравн", "\\bили\\s+(?:печатн|электрон|премиум|твёрд|тверд)",
  "\\bайырмашылы", "\\bайырмашылик", "\\bқайсысы", "\\bкайсысы", "\\bқайсын\\s+таңда", "\\bнесімен\\s+ерекше",
]);
const UNRESOLVED = rx([
  "\\bне\\s+ответил", "\\bне\\s+ответили", "\\bвы\\s+не\\s+понял", "\\bне\\s+понял[аи]?\\b", "\\bнепонятно", "\\bя\\s+же\\s+(?:спрашива|писал|сказал|просил)", "\\bповторяю", "\\bснова\\s+спрашиваю", "\\bтак\\s+и\\s+не\\b", "\\bдо\\s+сих\\s+пор\\b", "\\bответьте\\s+на\\s+вопрос",
  "\\bтүсінбедім", "\\bтусинбедим", "\\bтүсінбейм", "\\bжауап\\s+(?:бермедіңіз|бермедиңиз|бермедің)", "\\bсұрақ(?:ыма|қа)\\s+жауап",
]);
/** Условия запроса, которые надо согласовать между собой. */
const CONSTRAINTS: RegExp[] = [
  // дата / срок
  rx(["\\bк\\s+\\d{1,2}\\b", "\\bдо\\s+\\d{1,2}\\b", "\\d{1,2}[./]\\d{1,2}", "\\b(?:январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)", "\\bзавтра\\b", "\\bчерез\\s+(?:неделю|\\d+\\s+дн)", "\\b(?:қаңтар|ақпан|наурыз|сәуір|мамыр|маусым|шілде|тамыз|қыркүйек|қазан|қараша|желтоқсан)"]),
  // город / доставка
  rx(["\\bдоставк", "\\bгород", "\\bалмат", "\\bастан", "\\bшымкент", "\\bкараганд", "\\bқарағанд", "\\bжеткіз", "\\bпочт"]),
  // формат книги
  rx(["\\bпечатн", "\\bэлектрон", "\\bpdf\\b", "\\bтв[её]рд", "\\bпремиум", "\\bбаспа", "\\bэлектронды"]),
  // оплата
  rx(["\\bрассрочк", "\\bkaspi\\b", "\\bкаспи", "\\bпредоплат", "\\bперевод", "\\bred\\b", "\\bнал(?:ичн|ом)", "\\bбөліп\\s+төле", "\\bалдын\\s+ала"]),
  // количество экземпляров
  rx(["\\d+\\s*(?:экз|копи|книг|штук|шт\\b|дана)", "\\bдве\\s+книги", "\\bнесколько\\s+книг", "\\bекі\\s+кітап"]),
  // язык книги
  rx(["\\bна\\s+казахском", "\\bна\\s+русском", "\\bқазақша", "\\bказакша", "\\bорысша", "\\bдвух\\s+языках", "\\bекі\\s+тілде"]),
  // срочность
  rx(["\\bсрочно", "\\bбыстрее", "\\bэкспресс", "\\bуспе(?:ете|ть|ем)", "\\bшұғыл", "\\bтез\\b", "\\bүлгер"]),
];
/** Явное «и то, и другое»: условия тянут в разные стороны. */
const CONFLICT = rx(["\\bно\\s+при\\s+этом", "\\bно\\s+чтобы", "\\bпри\\s+этом\\b", "\\bодновременно", "\\bхотя\\b", "\\bно\\s+без\\b", "\\bбірақ\\b", "\\bбирак\\b"]);
const CHEAP = rx(["\\b(?:по)?дешевл", "\\bбюджет", "\\bнедорог", "\\bарзан"]);
const PREMIUM = rx(["\\bпремиум", "\\bподороже", "\\bсамую\\s+лучшую", "\\bлучш(?:ую|ий)\\s+вариант"]);
const PRINT = rx(["\\bпечатн", "\\bтв[её]рд", "\\bбаспа", "\\bкітап\\s+түрінде"]);

const words = (t: string) => new Set(norm(t).replace(/[^\p{L}\p{N} ]/gu, " ").split(" ").filter((w) => w.length > 2));

/** Клиент снова спрашивает то, о чём уже спрашивал до ответа бота (сходство слов ≥ 60 %). */
function repeatsEarlierQuestion(clientText: string, history: RouteInput["history"]): boolean {
  const now = words(clientText);
  if (now.size < 3) return false;
  const lastOurs = history.map((m) => m.from !== "client").lastIndexOf(true);
  if (lastOurs <= 0) return false;
  return history.slice(0, lastOurs).some((m) => {
    if (m.from !== "client") return false;
    const was = words(m.text);
    if (was.size < 3) return false;
    const common = [...now].filter((w) => was.has(w)).length;
    return common / new Set([...now, ...was]).size >= 0.6;
  });
}

/** Уровень модели для хода по признакам сложности (не по длине текста). */
export function chooseSellerTier(i: RouteInput): RouteChoice {
  const base = i.policy.defaultTier;
  if (i.overBudget) return { tier: "haiku", score: 0, reasons: ["budget"], hard: false, capped: true };
  // Напоминание молчащему и triage подсказки — короткие ходы без переговоров.
  if (i.purpose === "follow_up" || i.quick) return { tier: base, score: 0, reasons: [], hard: false, capped: false };
  const t = norm(i.clientText);
  const reasons: RouteReason[] = [];
  let score = 0;
  const add = (r: RouteReason, n: number) => {
    reasons.push(r);
    score += n;
  };
  const objection = t ? objectionKind(t) : null;
  if (objection === "price") add("price_objection", 2);
  else if (objection === "later") add("later_objection", 1);
  if (objection && i.ai.objections >= 1) add("repeat_objection", 1);
  if (DISCOUNT.test(t)) add("discount", 2);
  if (COMPARE.test(t)) add("compare", 2);
  const constraints = CONSTRAINTS.filter((re) => re.test(t)).length;
  if (constraints >= 2) add("constraints", Math.min(3, constraints - 1));
  // Противоречие: «дешевле, но премиум»; печатную к дате, к которой печатную не успеть; «и то, и другое» при нескольких условиях.
  const contradictions = [CHEAP.test(t) && PREMIUM.test(t), i.deadline === "late" && PRINT.test(t), CONFLICT.test(t) && constraints >= 2].filter(Boolean).length;
  if (contradictions) add("contradiction", 3 * Math.min(2, contradictions));
  const unresolved = UNRESOLVED.test(t) || repeatsEarlierQuestion(i.clientText, i.history);
  if (unresolved) add("unresolved", 2);
  if ((t.match(/\?/g)?.length ?? 0) >= 3) add("ambiguous", 1);
  if (i.deadline === "late" || i.deadline === "express") add("deadline", 1);
  if (i.ai.stage === "closing" || i.ai.stage === "agreed") add("stakes", 1);
  if (i.ai.failures > 0 || i.ai.blocked > 0) add("prior_failure", 1);
  // Переговоры продолжаются (прошлый ход уже был на старшем уровне, клиент всё ещё возражает) — не роняем уровень на полпути.
  if (i.ai.lastTier && i.ai.lastTier !== "haiku" && (objection || i.ai.stage === "objection")) add("negotiation", 1);

  const hard = contradictions > 0 || constraints >= 4 || (unresolved && !!i.ai.lastTier && i.ai.lastTier !== "haiku");
  const tier: RouteTier = score >= i.policy.opusAt && hard ? "opus" : score >= i.policy.sonnetAt ? "sonnet" : "haiku";
  return { tier: capTier(maxTier(tier, base), i.policy.tiers), score, reasons, hard, capped: false };
}

/** Почему ход поднимают на уровень выше: ответ не по схеме, не прошёл проверку кода, модель не уверена, модель не ответила. */
export type EscalationCause = "invalid" | "rejected" | "unsure" | "error";

/**
 * Следующий уровень после неудачи: Haiku → Sonnet всегда; Sonnet → Opus — только для подходящих ходов (тяжёлый признак
 * или сложность у порога Opus) и не из-за сбоя API (сбой — не признак сложности задачи); выше Opus — некуда.
 */
export function escalateTier(current: RouteTier, choice: RouteChoice, cause: EscalationCause, policy: { opusAt: number; tiers?: RouteTiers }): RouteTier | null {
  if (choice.capped) return null;
  const tiers = policy.tiers ?? ALL_TIERS;
  const opusFits = cause !== "error" && (choice.hard || choice.score >= policy.opusAt - 2);
  // Выключенный уровень пропускается: без Sonnet Haiku поднимается сразу на Opus — но только там, где Opus уместен.
  if (current === "haiku") return enabled("sonnet", tiers) ? "sonnet" : enabled("opus", tiers) && opusFits ? "opus" : null;
  if (current === "sonnet" && opusFits && enabled("opus", tiers)) return "opus";
  return null;
}
