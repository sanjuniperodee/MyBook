import { storeTimeZone } from "@/shared/domain/time";
import {
  BOT_DONE,
  readSellerAi,
  remindLabel,
  botSummary,
  botTurn,
  mediaCaption,
  newBotState,
  outcomeTitle,
  skipReasonLabels,
  startBlocker,
  type BotCatalog,
  type BotConfig,
  type BotInput,
  type BotLang,
  type BotSkipReason,
  type BotState,
  type BotTurnTrace,
  type DealField,
  type HistoryMessage,
} from "../domain";
import type { BotRecord } from "./ports";

/** Тест-режим бота в настройках: сообщения «клиента» по ходам и условия проверки. */
export interface BotPreviewInput {
  config: BotConfig;
  /** Каждый ход — то, что клиент отправил подряд, до ответа бота. */
  turns: { text: string; type: "text" | "audio" | "image" }[][];
  workTime: boolean;
  /** Новый клиент, клиент с аккаунтом на сайте или с заказом (бот промолчит). */
  client: "new" | "account" | "order";
  name: string;
  /** Продолжить тест AI-продажника с места, где остановились (ответы модели не пересчитываются заново). */
  resume?: { state: unknown; history: HistoryMessage[] } | null;
}

export interface BotPreviewResult {
  skipped: string | null;
  /** Реплики теста; у ответов AI-продажника — след хода («Почему так?»); пустой text у бота — бот промолчал. */
  transcript: { from: "client" | "bot"; text: string; trace?: BotTurnTrace }[];
  fields: { label: string; value: string }[];
  intents: string[];
  lang: BotLang;
  done: boolean;
  summary: string | null;
  /** Кто вёл диалог в тесте: шаблоны или AI-модель продажника (настоящий запрос к модели). */
  engine?: "template" | "ai";
  /** AI: состояние беседы и переписка — для следующего сообщения (в transcript только новые реплики). */
  resume?: { state: BotState; history: HistoryMessage[] };
}

/**
 * Прогон диалога тем же ходом бота, что и в чате, — без базы и без отправки: реальные поля сделки, цены и график,
 * но несохранённые настройки. Каждый вызов — с начала (состояние не хранится).
 */
export function botPreview(
  input: BotPreviewInput,
  ctx: { fields: DealField[]; catalog: BotCatalog; site: { url: string; registrationOpen: boolean; themes: string[]; landings: string[]; themeLandings?: Record<string, string> }; now: Date; nextWorkStart: Date | null; tz: string },
): BotPreviewResult {
  let state = newBotState(ctx.now, true);
  const transcript: BotPreviewResult["transcript"] = [];
  const all: BotInput[] = [];
  let seq = 0;
  const toInputs = (turn: BotPreviewInput["turns"][number]) => turn.map((m) => ({ id: `p${++seq}`, type: m.type, text: m.type === "text" ? m.text : m.text.trim() || mediaCaption(m.type), at: ctx.now }));
  const questions = input.config.questions.filter((q) => ctx.fields.some((f) => f.key === q.field)).length;
  const first = input.turns[0] ? toInputs(input.turns[0]) : [];
  seq = 0;
  const reason: BotSkipReason | null = startBlocker({
    channelOk: true,
    questions,
    deal: { orderId: null, firstStage: true, closed: false, assigned: false, unsorted: true },
    fresh: true,
    client: input.client === "order" ? { orders: 1, books: 0 } : null,
    priorChat: false,
    inputs: first,
  });
  if (reason) {
    for (const m of first) transcript.push({ from: "client", text: m.text });
    return { skipped: skipReasonLabels[reason], transcript, fields: [], intents: [], lang: "ru", done: true, summary: null };
  }
  for (const turn of input.turns) {
    const inputs = toInputs(turn);
    for (const m of inputs) transcript.push({ from: "client", text: m.text });
    all.push(...inputs);
    const r = botTurn(state, all, {
      config: input.config,
      fields: ctx.fields,
      dealValues: {},
      now: ctx.now,
      tz: ctx.tz,
      workTime: input.workTime,
      nextWorkStart: ctx.nextWorkStart,
      catalog: ctx.catalog,
      site: ctx.site,
      client: { known: input.client !== "new", locale: null },
      name: input.name,
    });
    state = r.state;
    if (r.reply) transcript.push({ from: "bot", text: r.reply });
    if (r.done) break;
  }
  const byKey = new Map(ctx.fields.map((f) => [f.key, f]));
  return {
    skipped: null,
    transcript,
    fields: Object.entries(state.filled).map(([k, v]) => ({ label: byKey.get(k)?.label ?? k, value: String(v) })),
    intents: state.intents,
    lang: state.lang,
    done: state.phase === "done",
    summary: state.phase === "done" ? botSummary(state, ctx.fields) : null,
  };
}

/** Состояние бота для шапки чата и кнопок «Остановить» / «Запустить». */
export interface BotStatus {
  label: string | null;
  tone: "active" | "waiting" | "done" | "none";
  canStop: boolean;
  canStart: boolean;
}

export function botStatus(rec: BotRecord | null, fields: DealField[]): BotStatus {
  const s = rec?.state;
  if (!s) {
    if (rec?.botStep != null && rec.botStep >= 0) return { label: `Бот (прежняя версия): вопрос ${rec.botStep + 1}`, tone: "active", canStop: true, canStart: false };
    return { label: null, tone: "none", canStop: false, canStart: true };
  }
  if (s.phase === "waiting" && rec?.botStep !== BOT_DONE && s.reason === "takeover") return { label: "Менеджер не отвечает — бот подхватит переписку", tone: "waiting", canStop: true, canStart: false };
  if (s.phase === "active" && rec?.botStep !== BOT_DONE && s.engine === "ai") {
    // Договорились написать повторно (bots-5): до этого дня бот молчит, менеджеру видно когда и почему.
    const remind = readSellerAi(s.ai).remind;
    if (remind) return { label: `Бот напишет клиенту ${remindLabel(remind, storeTimeZone())}`, tone: "waiting", canStop: true, canStart: false };
    const stage = s.ai.stage === "offer" || s.ai.stage === "closing" ? ", предложение сделано" : s.ai.stage === "objection" ? ", снимает возражение" : "";
    return { label: `${s.ai.takeover ? "Бот подхватил переписку" : "AI-продажник ведёт диалог"}${stage}`, tone: "active", canStop: true, canStart: false };
  }
  if (s.phase === "waiting" && rec?.botStep !== BOT_DONE) return { label: "Бот ответит, если менеджер не ответит раньше", tone: "waiting", canStop: true, canStart: false };
  if (s.phase === "active" && rec?.botStep !== BOT_DONE && s.stage === "offer") return { label: "Бот сделал предложение — ждёт ответа клиента", tone: "active", canStop: true, canStart: false };
  if (s.phase === "active" && rec?.botStep !== BOT_DONE) {
    const i = s.asking ? s.questions.indexOf(s.asking) : -1;
    const label = fields.find((f) => f.key === s.asking)?.label;
    return { label: i >= 0 ? `Бот: вопрос ${i + 1} из ${s.questions.length}${label ? ` (${label})` : ""}` : "Бот ведёт диалог", tone: "active", canStop: true, canStart: false };
  }
  const outcome =
    s.outcome === "stopped_by_manager"
      ? "Бот остановлен — ответил человек"
      : s.outcome === "skipped"
        ? `Бот не начинал: ${skipReasonLabels[s.reason as BotSkipReason] ?? s.reason ?? ""}`
        : s.outcome === "disabled"
          ? "Бот выключен в настройках"
          : s.outcome === "handoff"
            ? `Бот передал менеджеру: ${outcomeTitle(s).replace(/^Клиент /, "")}`
            : `${outcomeTitle(s)}`;
  return { label: outcome, tone: "done", canStop: false, canStart: true };
}
