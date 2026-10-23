/**
 * След хода AI-продажника — «Почему так?» у ответа бота в чате и в тест-режиме настроек. Одна запись на ход в журнале
 * бота (crm_bot_events, kind = turn, meta): что решила модель, что из этого сделал код (записал в сделку, отправил
 * подборку, заблокировал, переписал, передал менеджеру), вердикт по сроку к дате, уроки и куски базы знаний в инструкции,
 * токены. По нему разбирают ошибки ночного продажника без pm2 logs. Чистые функции, без текста ответа и номеров клиента.
 */
import type { BotLang } from "./botNlu";
import type { BotEvent, BotOutcome, BotState, DeadlineKind } from "./botEngine";
import type { SellerAction, SellerHandoff } from "./botSeller";
import type { SellerStage } from "./botSellerState";
import type { EscalationCause, RouteReason, RouteTier } from "./botRoute";

/** Сколько дней хранится след хода: дальше записи чистит медленный проход планировщика. */
export const BOT_TRACE_KEEP_DAYS = 90;

/**
 * Что код поправил или остановил в ходе: переписать по замечаниям (rewrite), второй раз не прошёл проверку
 * (blocked_twice), убрал повторное «Здравствуйте» (greeting_removed), добавил представление (intro_added), потолок беседы
 * (limit), повтор прошлого сообщения (loop), модель промолчала на вопрос (unanswered), цену спросили в N-й раз (price_asks),
 * N-е возражение (objections), счёт не по правилам (invoice_blocked), счёт не выставился (invoice_failed), клиент уже
 * платил (already_paid), срок пересчитан по названной дате (deadline_recheck), вопрос о сайте — ответ по справочнику платформы (platform), в тексте номер или карта — не отправлен
 * (sensitive), менеджер ответил посреди хода (stopped), модель не ответила (ai_error), голосовое или файл без распознавания
 * (voice, media), модель не ответила на напоминание (follow_up_skipped); повторное сообщение (bots-5): договорились
 * написать в названный день (remind_set), клиент её подтвердил (remind_kept), вернулся к разговору раньше срока — снята
 * (remind_dropped, detail — promised или last_start), дату отбросил код (remind_rejected — причина RemindReject), ответ с
 * обещанием всё же ушёл — менеджеру задача (remind_broken), договорённость отменена (remind_cancelled), написал по
 * договорённости (remind_touch) или в последний день старта (last_start).
 */
export const TRACE_NOTE_CODES = [
  "rewrite",
  "blocked_twice",
  "greeting_removed",
  "intro_added",
  "limit",
  "loop",
  "unanswered",
  "price_asks",
  "objections",
  "invoice_blocked",
  "invoice_failed",
  "already_paid",
  "deadline_recheck",
  "platform",
  "sensitive",
  "stopped",
  "ai_error",
  "voice",
  "media",
  "follow_up_skipped",
  "remind_set",
  "remind_kept",
  "remind_dropped",
  "remind_rejected",
  "remind_broken",
  "remind_cancelled",
  "remind_touch",
  "last_start",
] as const;
export type TraceNoteCode = (typeof TRACE_NOTE_CODES)[number];
export interface TraceNote {
  code: TraceNoteCode;
  detail?: string;
}

/**
 * Один запрос хода к модели: зачем (первый, повтор, пересчёт срока, переписать, неуверенный ответ, короче переписка),
 * кто ответил, токены с кэшем, стоимость по прайсу, задержка; failed — вид сбоя, если запрос не удался; retries —
 * неудачные попытки внутри маршрута (пауза и повтор, запасной провайдер). Без текстов запроса и ответа.
 */
export interface TraceRouteCall {
  why: "first" | "retry" | "deadline" | "rewrite" | "unsure" | "context";
  tier: RouteTier | null;
  provider: string;
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number | null;
  ms: number;
  fallback: boolean;
  retries: number;
  failed?: string;
}

/** Маршрут хода: какой уровень выбран и почему (коды признаков), эскалации, запросы и их стоимость. */
export interface TraceRoute {
  mode: "on" | "shadow" | "off";
  chosen: RouteTier;
  score: number;
  reasons: RouteReason[];
  /** Уровень последнего удачного запроса; null — ответил запасной провайдер или режим off. */
  final: RouteTier | null;
  escalations: { from: RouteTier; to: RouteTier; cause: EscalationCause }[];
  calls: TraceRouteCall[];
  costUsd: number;
  /** Потолок расходов: только Haiku, без эскалаций. */
  capped: boolean;
}

/** Вердикт кода по сроку к дате события (deadlinePlan): модель его только пересказывает. */
export interface TraceDeadline {
  date: string;
  kind: DeadlineKind;
  fillBy: string;
  expressFillBy?: string;
  city?: string;
}

export interface BotTurnTrace {
  v: 1;
  /** Ответ на сообщения клиента или напоминание молчащему. */
  purpose: "reply" | "follow_up";
  /** Решение модели; null — модель не спрашивали (голосовое без распознавания) или она не ответила. */
  model: { action: SellerAction; stage: SellerStage; handoff: SellerHandoff; lang: BotLang; summary: string } | null;
  /** Чем закончился ход по коду: беседа идёт или передана менеджеру (причина из журнала), закрыта. */
  result: { phase: BotState["phase"]; outcome: BotOutcome | null; handoff: string | null };
  /** Что записано в поля сделки (ключ → значение). */
  fields: Record<string, string | number>;
  deadline: TraceDeadline | null;
  /** Подборка материалов ушла с ответом: сколько файлов отправлено. */
  materials: { files: number } | null;
  notes: TraceNote[];
  /** Уроки работы над ошибками в инструкции этого хода. */
  lessons: { id: string; text: string }[];
  /** База знаний: целиком (all) или куски по теме разговора (заголовки); null — базы нет. */
  knowledge: { all: boolean; titles: string[] } | null;
  /** Токены всех запросов хода к модели (повтор, пересчёт срока, переписывание); null — модель не спрашивали. */
  tokens: { input: number; output: number; calls: number } | null;
  /** Маршрут модели: уровень Claude, эскалации, кто ответил, стоимость (старые записи — без него). */
  route?: TraceRoute | null;
  /** Ошибка модели (таймаут, ответ не по схеме). */
  error?: string;
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** След без лишнего: короткие строки, не больше 12 замечаний, уроков и кусков, значения полей — до 120 знаков. */
export function compactTrace(t: BotTurnTrace): BotTurnTrace {
  const notes: TraceNote[] = [];
  for (const n of t.notes) if (!notes.some((x) => x.code === n.code && x.detail === n.detail)) notes.push(n.detail ? { code: n.code, detail: cut(n.detail, 200) } : { code: n.code });
  return {
    ...t,
    model: t.model ? { ...t.model, summary: cut(t.model.summary, 300) } : null,
    fields: Object.fromEntries(Object.entries(t.fields).map(([k, v]) => [k, typeof v === "string" ? cut(v, 120) : v])),
    notes: notes.slice(0, 12),
    lessons: t.lessons.slice(0, 12).map((l) => ({ id: l.id, text: cut(l.text, 80) })),
    knowledge: t.knowledge ? { all: t.knowledge.all, titles: t.knowledge.titles.slice(0, 12).map((x) => cut(x, 80)) } : null,
    ...(t.route ? { route: { ...t.route, calls: t.route.calls.slice(0, 8).map((c) => ({ ...c, model: cut(c.model, 80) })), escalations: t.route.escalations.slice(0, 4) } } : {}),
    ...(t.error ? { error: cut(t.error, 200) } : {}),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** След из журнала (jsonb): не тот формат — null, экран не падает на старой или испорченной записи. */
export function readBotTrace(raw: unknown): BotTurnTrace | null {
  if (!isObj(raw) || raw.v !== 1 || !isObj(raw.result) || !Array.isArray(raw.notes)) return null;
  const r = raw as unknown as BotTurnTrace;
  return {
    v: 1,
    purpose: r.purpose === "follow_up" ? "follow_up" : "reply",
    model: isObj(r.model) ? r.model : null,
    result: { phase: r.result.phase, outcome: r.result.outcome ?? null, handoff: r.result.handoff ?? null },
    fields: isObj(r.fields) ? r.fields : {},
    deadline: isObj(r.deadline) ? r.deadline : null,
    materials: isObj(r.materials) ? r.materials : null,
    notes: r.notes.filter((n) => isObj(n) && (TRACE_NOTE_CODES as readonly string[]).includes(String(n.code))),
    lessons: Array.isArray(r.lessons) ? r.lessons.filter(isObj) : [],
    knowledge: isObj(r.knowledge) ? { all: !!r.knowledge.all, titles: Array.isArray(r.knowledge.titles) ? r.knowledge.titles.map(String) : [] } : null,
    tokens: isObj(r.tokens) ? r.tokens : null,
    ...(isObj(r.route) && Array.isArray(r.route.calls) ? { route: { ...r.route, reasons: Array.isArray(r.route.reasons) ? r.route.reasons : [], escalations: Array.isArray(r.route.escalations) ? r.route.escalations : [], calls: r.route.calls.filter(isObj) } } : {}),
    ...(typeof r.error === "string" ? { error: r.error } : {}),
  };
}

/** Что о ходе знает запрос к модели: токены, вердикт по сроку, правки кода до ответа, уроки и база знаний в инструкции. */
export interface TraceContext {
  tokens: { input: number; output: number; calls: number };
  route?: TraceRoute | null;
  deadline: TraceDeadline | null;
  notes: TraceNote[];
  lessons: { id: string; text: string }[];
  knowledge: { all: boolean; titles: string[] } | null;
}

/**
 * След хода из того, что решила модель (decision; null — не спрашивали или не ответила), что знал запрос (context), и
 * итога хода: состояние, события журнала (причина передачи — последняя из них), записанные поля, правки кода.
 */
export function turnTrace(i: {
  purpose: BotTurnTrace["purpose"];
  decision: { action: SellerAction; stage: SellerStage; handoff: SellerHandoff; lang: BotLang; summary: string } | null;
  context: TraceContext | null;
  state: Pick<BotState, "phase" | "outcome">;
  events: Pick<BotEvent, "kind" | "reason">[];
  fields?: Record<string, string | number>;
  notes?: TraceNote[];
  materials?: number | null;
  error?: string;
}): BotTurnTrace {
  const handoff = [...i.events].reverse().find((e) => e.kind === "handoff")?.reason ?? null;
  const d = i.decision;
  return compactTrace({
    v: 1,
    purpose: i.purpose,
    model: d ? { action: d.action, stage: d.stage, handoff: d.handoff, lang: d.lang, summary: d.summary } : null,
    result: { phase: i.state.phase, outcome: i.state.outcome ?? null, handoff },
    fields: i.fields ?? {},
    deadline: i.context?.deadline ?? null,
    materials: i.materials != null ? { files: i.materials } : null,
    notes: [...(i.context?.notes ?? []), ...(i.notes ?? [])],
    lessons: i.context?.lessons ?? [],
    knowledge: i.context?.knowledge ?? null,
    tokens: i.context ? i.context.tokens : null,
    ...(i.context?.route ? { route: i.context.route } : {}),
    ...(i.error ? { error: i.error } : {}),
  });
}
