import { phoneTail } from "@/shared/domain/phone";
import {
  BOT_DONE,
  allowedAmounts,
  allowedPercents,
  botSellText,
  botSummary,
  classifyInputs,
  mediaCaption,
  newBotState,
  newSellerAiState,
  deadlineFact,
  faqNotes,
  findSensitive,
  parseSellerDecision,
  preview,
  priceMentioned,
  readBotState,
  readSellerAi,
  resolveSellerTurn,
  sellerSchema,
  sellerSystemPrompt,
  sellerTranscript,
  sellerUserPrompt,
  type BotConfig,
  type BotEnv,
  type BotEvent,
  type BotInput,
  type BotState,
  type Conversation,
  type DealField,
  type HistoryMessage,
  type ReplyProblem,
  type SellerDecision,
  type SellerTurn,
} from "../domain";
import { BOT_ABANDON_MS, BOT_OFFER_IDLE_MS, BOT_PAUSE_MS } from "./botTiming";
import type { BotPreviewInput, BotPreviewResult } from "./botPreview";
import type { QualifierBotDeps } from "./bot";

/** Сколько модель думает над одним ответом: клиент ждёт в чате. */
export const SELLER_TIMEOUT_MS = 30_000;
/** Через сколько повторить ход после сбоя модели; на второй сбой беседу берёт менеджер. */
export const SELLER_RETRY_MS = 60_000;
export const SELLER_MAX_FAILURES = 2;
/** Сколько последних сообщений переписки видит модель. */
const HISTORY_LIMIT = 60;

/** То, что AI-продажнику нужно от квалификатора: окружение хода, итог менеджеру, «предложение сделано», таймер. */
export interface SellerHooks {
  env(conv: Conversation, config: BotConfig, fields: DealField[], now: Date): Promise<BotEnv>;
  finish(conv: Conversation, state: BotState, fields: DealField[]): Promise<void>;
  offered(conv: Conversation, state: BotState, fields: DealField[]): Promise<void>;
  later(conversationId: string, due: Date): Promise<void>;
}

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* ниже — null */
      }
    }
    return null;
  }
};

const dayValue = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/**
 * AI-продажник: ведёт беседу целиком. Модель — только «голова»: понимает клиента и предлагает ответ и действие. Всё, что
 * затрагивает деньги и репутацию (цены, проценты, ссылки, номера, право на счёт, потолок беседы, сумма счёта), решает и
 * проверяет код (domain/botSeller.ts). Клиент никогда не остаётся без ответа: сбой модели или спорный ответ — менеджеру.
 */
export class AiSeller {
  constructor(
    private readonly d: QualifierBotDeps,
    private readonly hooks: SellerHooks,
  ) {}

  /** Подключена ли модель продажника. */
  async available(): Promise<boolean> {
    if (!this.d.seller || !this.d.history) return false;
    return this.d.seller.configured().catch(() => false);
  }

  /** Ход беседы: true — состояние изменилось параллельно или пришло новое сообщение, ход надо повторить. */
  async turn(conv: Conversation, state: BotState, config: BotConfig, fields: DealField[], now: Date): Promise<boolean> {
    const inputs = await this.d.store.incoming(conv.id, new Date(state.since));
    const fresh = inputs.filter((i) => !state.seen.includes(i.id));
    if (!fresh.length && state.phase === "active") return false;
    const env = await this.hooks.env(conv, config, fields, now);
    const c = classifyInputs(fresh);

    const start = state.phase === "waiting";
    const questions = config.questions.map((q) => q.field).filter((k) => fields.some((f) => f.key === k));
    const waited = conv.awaitingSince ? Math.max(0, Math.round((now.getTime() - new Date(conv.awaitingSince).getTime()) / 60_000)) : 0;
    const base: BotState = start
      ? { ...state, phase: "active", startedAt: now.toISOString(), questions, first: preview(c.texts[0] ?? (c.voice ? "🎤" : c.media ? "📷" : "")), ai: { ...readSellerAi(state.ai), waitedMinutes: state.ai.takeover ? waited : 0 } }
      : state;

    // Бота запустили кнопкой, новых сообщений нет: модель продолжает переписку сама.
    const manual = start && state.reason === "manual";
    if (!c.text && !manual) return this.withoutText(conv, base, state, fresh, c, env, fields, now);

    const history = await this.d.history!(conv.id, HISTORY_LIMIT);
    const decided = await this.decide({ conv, base, env, config, fields, history, fresh, purpose: "reply" });
    if ("error" in decided) return this.failed(conv, base, state, decided.error, env, fields, now);

    // Клиент дописал, пока модель думала: ответ был бы на устаревшее — повторяем ход со всеми сообщениями.
    const latest = await this.d.store.incoming(conv.id, new Date(state.since));
    if (latest.some((i) => !base.seen.includes(i.id) && !fresh.some((f) => f.id === i.id))) return true;

    const result = decided.turn;
    const next: BotState = { ...result.state, engine: "ai", ai: { ...readSellerAi(result.state.ai), failures: 0 } };
    result.state = next;
    const saved = await this.d.store.save(conv.id, state.version, { botStep: result.done ? BOT_DONE : 0, state: next, dueAt: result.done ? null : new Date(now.getTime() + BOT_ABANDON_MS) });
    if (!saved) return true;
    await this.apply(conv, state, result, fields, env);
    if (!result.done) {
      // Клиент написал, пока бот отвечал: следующий ход после обычной паузы, а не через полчаса.
      const unseen = (await this.d.store.incoming(conv.id, new Date(next.since))).filter((i) => !next.seen.includes(i.id));
      if (unseen.length) await this.hooks.later(conv.id, new Date(Math.max(now.getTime(), ...unseen.map((i) => new Date(i.at).getTime())) + BOT_PAUSE_MS));
    }
    return false;
  }

  /** Напоминание после предложения: модель решает, нужно ли оно и как написать; false — не отправлено (клиент простился и т. п.). */
  async followUp(conv: Conversation, state: BotState, config: BotConfig, fields: DealField[], now: Date): Promise<boolean> {
    const env = await this.hooks.env(conv, config, fields, now);
    const history = await this.d.history!(conv.id, HISTORY_LIMIT);
    const decided = await this.decide({ conv, base: state, env, config, fields, history, fresh: [], purpose: "follow_up" });
    // Напоминание — необязательная любезность: ошибка модели или спорный текст = молчим, не зовём менеджера.
    const decision = "turn" in decided ? decided.decision : null;
    const sendIt = !!decision && decision.action !== "wait" && !!decision.reply;
    let reply: string | null = null;
    const events: BotEvent[] = [{ kind: "follow_up" }];
    if (sendIt && decision) {
      const turn = resolveSellerTurn(state, { ...decision, action: "reply", agreed: false, handoff: "none" }, env, this.ctx(conv, env, config, [], history, false, await this.rules(conv, env, config)));
      if (!turn.retry && turn.reply) reply = turn.reply;
    }
    const ai = readSellerAi(state.ai);
    const next: BotState = { ...state, followedUp: true, lastBotAt: reply ? now.toISOString() : state.lastBotAt, ai: { ...ai, closeAsked: reply ? false : ai.closeAsked }, version: state.version + 1 };
    if (!(await this.d.store.save(conv.id, state.version, { botStep: 0, state: next, dueAt: new Date(now.getTime() + BOT_OFFER_IDLE_MS) }))) return true;
    if (reply) {
      const current = await this.d.store.load(conv.id);
      if (current?.state?.outcome !== "stopped_by_manager") await this.d.send(conv.id, reply);
    }
    await this.d.store.log(conv.id, conv.dealId, next.lang, events);
    return false;
  }

  /**
   * Тест-режим в настройках: настоящий диалог с моделью продажника по несохранённым настройкам — без базы и без
   * отправки клиенту; счёт показывается строкой, а не выставляется. Каждый вызов — с начала.
   */
  async preview(input: BotPreviewInput, ctx: { fields: DealField[]; catalog: BotEnv["catalog"]; site: BotEnv["site"]; now: Date; nextWorkStart: Date | null; tz: string }): Promise<BotPreviewResult> {
    const config = input.config;
    const questions = config.questions.map((q) => q.field).filter((k) => ctx.fields.some((f) => f.key === k));
    const conv: Conversation = { id: "preview", channel: "whatsapp", channelId: "", chatId: "77000000001", contactName: input.name, avatarUrl: null, clientId: null, dealId: null, assigneeId: null, botStep: null, meta: {} };
    const env: BotEnv = { config, fields: ctx.fields, dealValues: {}, now: ctx.now, tz: ctx.tz, workTime: input.workTime, nextWorkStart: ctx.nextWorkStart, catalog: ctx.catalog, site: ctx.site, client: { known: input.client !== "new", locale: null }, name: input.name };
    const resumed = input.resume ? readBotState(input.resume.state) : null;
    let state: BotState = resumed ?? { ...newBotState(ctx.now, true), engine: "ai", phase: "active", startedAt: ctx.now.toISOString(), questions, ai: newSellerAiState() };
    if (resumed?.phase === "done") return { skipped: null, transcript: [{ from: "bot", text: "Диалог уже завершён (передан менеджеру или закрыт). Нажмите «Сначала»." }], fields: [], intents: [], lang: state.lang, done: true, summary: null, engine: "ai", resume: { state, history: input.resume?.history ?? [] } };
    if (input.client === "order") {
      const skipped = "у клиента есть заказ";
      return { skipped, transcript: input.turns[0]?.map((m) => ({ from: "client" as const, text: m.text })) ?? [], fields: [], intents: [], lang: "ru", done: true, summary: null, engine: "ai" };
    }
    const transcript: BotPreviewResult["transcript"] = [];
    const history: HistoryMessage[] = (input.resume?.history ?? []).map((m) => ({ ...m, at: new Date(m.at) }));
    let seq = history.length;
    for (const turn of input.turns) {
      const fresh: BotInput[] = turn.map((m) => ({ id: `p${++seq}`, type: m.type, text: m.type === "text" ? m.text : m.text.trim() || mediaCaption(m.type), at: ctx.now }));
      for (const m of fresh) {
        transcript.push({ from: "client", text: m.text });
        history.push({ from: "client", text: m.type === "text" ? m.text : m.type === "audio" ? "[голосовое сообщение]" : "[фото]", at: ctx.now });
      }
      const c = classifyInputs(fresh);
      if (!c.text) {
        // Голосовое и фото модель не видит: как в чате — просьба написать текстом или передача менеджеру.
        const key = c.media ? "media" : "voice";
        const reply = botSellText(state, env, key);
        if (reply) {
          transcript.push({ from: "bot", text: reply });
          history.push({ from: "bot", text: reply, at: ctx.now });
        }
        if (c.media) {
          state = { ...state, phase: "done", outcome: "handoff", reason: "media" };
          break;
        }
        continue;
      }
      const decided = await this.decide({ conv, base: { ...state, seen: [] }, env, config, fields: ctx.fields, history, fresh, purpose: "reply" });
      if ("error" in decided) {
        transcript.push({ from: "bot", text: `⚠️ Модель не ответила: ${decided.error}. В чате клиент получил бы «передала менеджеру».` });
        state = { ...state, phase: "done", outcome: "handoff", reason: "question" };
        break;
      }
      state = decided.turn.state;
      if (decided.turn.invoice) {
        const inv = decided.turn.invoice;
        const lead = decided.turn.reply ? `${decided.turn.reply}\n\n` : "";
        transcript.push({ from: "bot", text: `${lead}🧾 [Здесь бот выставит счёт на ${new Intl.NumberFormat("ru-RU").format(inv.amount)} ₸ (${inv.plan === "digital" ? "электронная" : "печатная"}, цена по договорённости ${new Intl.NumberFormat("ru-RU").format(inv.total)} ₸) со ссылкой на оплату]` });
        history.push({ from: "bot", text: decided.turn.reply ?? "", at: ctx.now });
      } else if (decided.turn.reply) {
        transcript.push({ from: "bot", text: decided.turn.reply });
        history.push({ from: "bot", text: decided.turn.reply, at: ctx.now });
      }
      if (decided.turn.done) break;
    }
    const byKey = new Map(ctx.fields.map((f) => [f.key, f]));
    return {
      skipped: null,
      transcript,
      fields: Object.entries(state.filled).map(([k, v]) => ({ label: byKey.get(k)?.label ?? k, value: String(v) })),
      intents: state.ai.summary ? [state.ai.summary] : [],
      lang: state.lang,
      done: state.phase === "done",
      summary: state.phase === "done" ? botSummary(state, ctx.fields) : null,
      engine: "ai",
      resume: { state, history },
    };
  }

  // ─── модель ────────────────────────────────────────────────────────────────

  private async rules(conv: Conversation, env: BotEnv, config: BotConfig) {
    const knowledge = await this.d.settings.knowledge().catch(() => "");
    const owner = [config.promo.ru, config.promo.kk, knowledge, ...faqNotes(env)];
    return {
      amounts: allowedAmounts(env.catalog, config.sell, owner),
      percents: allowedPercents(owner),
      urls: [env.site.url].filter(Boolean),
      phones: [conv.chatId, conv.meta.phone, await this.d.shopPhone()],
    };
  }

  private ctx(conv: Conversation, env: BotEnv, config: BotConfig, inputs: BotInput[], history: HistoryMessage[], second: boolean, rules: Awaited<ReturnType<AiSeller["rules"]>>) {
    return { inputs, clientText: inputs.map((i) => i.text).join("\n"), priceInHistory: priceMentioned(history), rules, second, lastBotText: [...history].reverse().find((m) => m.from === "bot")?.text ?? null };
  }

  /**
   * Запрос к модели с проверкой. Если клиент назвал дату — срок считает код и ответ переписывается с этим фактом; если
   * ответ нарушил правила (чужая цена, ссылка, номер) — один раз просим переписать. Возвращает ход или ошибку модели.
   */
  private async decide(a: { conv: Conversation; base: BotState; env: BotEnv; config: BotConfig; fields: DealField[]; history: HistoryMessage[]; fresh: BotInput[]; purpose: "reply" | "follow_up" }): Promise<{ turn: SellerTurn; decision: SellerDecision } | { error: string }> {
    const { conv, base, env, config, fields, history, fresh, purpose } = a;
    const knowledge = await this.d.settings.knowledge().catch(() => "");
    const schemaFields = fields.filter((f) => base.questions.includes(f.key));
    const schema = sellerSchema(schemaFields);
    const rules = await this.rules(conv, env, config);
    const ai = readSellerAi(base.ai);
    const dateKey = fields.find((f) => f.type === "date")?.key;
    const knownDate = (dateKey ? dayValue(base.filled[dateKey]) ?? dayValue(env.dealValues[dateKey]) : null) ?? dayValue(ai.eventDate);
    const known = fields
      .filter((f) => f.type !== "checkbox")
      .map((f) => ({ label: f.label, value: base.filled[f.key] ?? env.dealValues[f.key] }))
      .filter((k): k is { label: string; value: string | number } => k.value !== undefined && k.value !== null && k.value !== "")
      .map((k) => ({ label: k.label, value: String(k.value) }));
    const transcript = sellerTranscript(history, fresh.length, env.tz);
    const user = sellerUserPrompt(transcript, purpose, fresh.length > 0);

    const ask = async (extraFact: string | null, retry: ReplyProblem[] | null, deadline: string | null): Promise<SellerDecision | { error: string }> => {
      const system = sellerSystemPrompt({ env, state: base, questions: base.questions, knowledge, brand: this.d.settings.brand(), known, deadline, takeoverMinutes: ai.takeover ? ai.waitedMinutes : null, purpose, extraFact, retry });
      let raw: string;
      try {
        raw = await this.d.seller!.complete({ system, user, schema: schema as unknown as Record<string, unknown>, timeoutMs: SELLER_TIMEOUT_MS });
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
      const decision = parseSellerDecision(parseJson(raw), schemaFields, env.now, env.tz);
      return decision ?? { error: "ответ модели не по схеме" };
    };

    let deadline = knownDate ? deadlineFact(knownDate, env) : null;
    let first = await ask(null, null, deadline);
    // Одна повторная попытка на случай неверного JSON: клиент ждёт, но пустой ход хуже.
    if ("error" in first) first = await ask(null, null, deadline);
    if ("error" in first) return first;
    let decision = first;

    // Клиент назвал новую дату — считаем срок кодом и просим ответить с учётом вердикта.
    if (decision.eventDate && decision.eventDate !== knownDate && purpose === "reply") {
      const fact = deadlineFact(decision.eventDate, env);
      if (fact) {
        deadline = fact;
        const again = await ask(null, null, fact);
        if (!("error" in again)) decision = { ...again, eventDate: again.eventDate ?? decision.eventDate, fields: { ...decision.fields, ...again.fields } };
      }
    }

    const inputs = fresh;
    let turn = resolveSellerTurn(base, decision, env, this.ctx(conv, env, config, inputs, history, false, rules));
    if (turn.retry) {
      const problems = turn.retry;
      const rewritten = await ask(null, problems, deadline);
      if ("error" in rewritten) return rewritten;
      decision = rewritten;
      turn = resolveSellerTurn(base, rewritten, env, this.ctx(conv, env, config, inputs, history, true, rules));
    }
    return { turn, decision };
  }

  // ─── последствия хода ──────────────────────────────────────────────────────

  private async apply(conv: Conversation, before: BotState, result: SellerTurn, fields: DealField[], env: BotEnv) {
    const dealId = conv.dealId!;
    for (const [key, value] of Object.entries(result.fields)) await this.d.sales.setField(dealId, key, value);
    const events: BotEvent[] = [...result.events];
    let final = result.state;

    if (result.state.ai.takeover && result.state.ai.turns === 1) await this.announceTakeover(conv, result.state);

    if (result.invoice && result.done) {
      const invoiced = await this.invoice(conv, result);
      if (invoiced) {
        final = invoiced.state;
        events.push({ kind: "invoiced", reason: invoiced.label });
      } else {
        // Счёт не вышел: клиенту — «менеджер пришлёт», менеджеру — срочная задача (finish).
        const text = botSellText(result.state, env, "agreedLater");
        if (text) await this.send(conv, text);
        events.push({ kind: "blocked", reason: "invoice: не выставлен" });
      }
    } else if (result.reply) {
      await this.send(conv, result.reply);
    }

    await this.d.store.log(conv.id, dealId, final.lang, events);
    if (final.stage === "offer" && before.stage !== "offer") await this.hooks.offered(conv, final, fields);
    if (result.done) await this.hooks.finish(conv, final, fields);
  }

  /** Отправить клиенту, если человек не вмешался, пока бот думал. */
  private async send(conv: Conversation, text: string) {
    const current = await this.d.store.load(conv.id);
    if (current?.state?.outcome === "stopped_by_manager") return;
    const found = findSensitive(text, [conv.chatId, conv.meta.phone, await this.d.shopPhone()]);
    if (found.length) {
      this.d.logger.error("bot reply blocked", found.map((f) => f.kind).join(","));
      return;
    }
    await this.d.send(conv.id, text);
  }

  /** Счёт на сумму, посчитанную кодом: сначала текст модели перед счётом, потом счёт. null — не вышло. */
  private async invoice(conv: Conversation, result: SellerTurn): Promise<{ state: BotState; label: string } | null> {
    const inv = result.invoice;
    if (!inv || !this.d.invoices) return null;
    const state = result.state;
    const deal = await this.d.sales.deal(conv.dealId!);
    const env = { name: deal?.contactName ?? "" };
    const res = await this.d.invoices
      .issue({ conversationId: conv.id, dealId: conv.dealId!, plan: inv.plan, agreedTotal: inv.total, amount: inv.amount, locale: state.lang, clientName: env.name, key: `bot:${conv.id}:${state.version}` })
      .catch((err) => ({ error: String(err) }));
    if ("error" in res) {
      this.d.logger.warn("bot invoice", { error: res.error });
      await this.d.store.log(conv.id, conv.dealId, state.lang, [{ kind: "blocked", reason: `invoice: ${res.error}`.slice(0, 200) }]);
      return null;
    }
    const next: BotState = { ...state, outcome: "invoiced", reason: res.label, version: state.version + 1 };
    if (!(await this.d.store.save(conv.id, state.version, { botStep: BOT_DONE, state: next, dueAt: null }, { restart: true }))) return null;
    if (result.reply) await this.send(conv, result.reply);
    await this.send(conv, res.text);
    return { state: next, label: res.label };
  }

  /** Бот подхватил переписку: менеджер видит это сразу и может ответить сам — тогда бот замолчит. */
  private async announceTakeover(conv: Conversation, state: BotState) {
    const deal = await this.d.sales.deal(conv.dealId!);
    const text = `🤖 Бот подхватил переписку: клиент ждал ответа ${state.ai.waitedMinutes} мин. Ответьте в чате сами — бот замолчит.`;
    await this.d.note(conv.id, text).catch((err) => this.d.logger.error("bot note", err));
    if (deal) {
      const who = deal.contactName || conv.contactName || phoneTail(conv.chatId) || "клиент";
      await this.d.notifier.notify(deal.assigneeId, "chats.view", { kind: "message", title: `Бот подхватил чат: ${who}`, body: `Клиент ждал ответа ${state.ai.waitedMinutes} мин.`, link: `/admin/chats?c=${conv.id}` });
    }
  }

  // ─── без текста и сбои ─────────────────────────────────────────────────────

  /** Голосовое, фото или файл: модель их не видит. Голосовое — просим текст (один раз); фото и файлы (чек) — менеджеру. */
  private async withoutText(conv: Conversation, base: BotState, prev: BotState, fresh: BotInput[], c: ReturnType<typeof classifyInputs>, env: BotEnv, fields: DealField[], now: Date): Promise<boolean> {
    const s: BotState = { ...base, seen: [...base.seen, ...fresh.map((i) => i.id)].slice(-200), version: prev.version + 1, ai: { ...readSellerAi(base.ai) } };
    const events: BotEvent[] = [];
    let reply: string | null = null;
    let done = false;
    if (c.media || (c.voice && s.ack.includes("voice"))) {
      // Файл (часто чек) или повторное голосовое: человек.
      s.phase = "done";
      s.outcome = "handoff";
      s.reason = c.media ? "media" : "manager";
      s.asking = null;
      reply = botSellText(s, env, c.media ? "media" : "handoff") || null;
      events.push({ kind: c.media ? "media" : "handoff", reason: c.media ? "ai" : "voice" });
      done = true;
    } else if (c.voice) {
      s.ack = [...s.ack, "voice"];
      reply = botSellText(s, env, "voice") || null;
      events.push({ kind: "media", reason: "voice" });
    } else if (!fresh.length) {
      return false;
    }
    if (reply) s.lastBotAt = now.toISOString();
    if (!(await this.d.store.save(conv.id, prev.version, { botStep: done ? BOT_DONE : 0, state: s, dueAt: done ? null : new Date(now.getTime() + BOT_ABANDON_MS) }))) return true;
    if (reply) await this.send(conv, reply);
    await this.d.store.log(conv.id, conv.dealId, s.lang, events);
    if (done) await this.hooks.finish(conv, s, fields);
    return false;
  }

  /** Модель не ответила: повтор через минуту; на второй сбой беседу берёт менеджер (клиент получает обычное «передала менеджеру»). */
  private async failed(conv: Conversation, base: BotState, prev: BotState, why: string, env: BotEnv, fields: DealField[], now: Date): Promise<boolean> {
    const ai = readSellerAi(base.ai);
    ai.failures += 1;
    this.d.logger.warn("bot ai", { error: why });
    if (ai.failures < SELLER_MAX_FAILURES) {
      const due = new Date(now.getTime() + SELLER_RETRY_MS);
      const s: BotState = { ...base, ai, version: prev.version + 1 };
      if (!(await this.d.store.save(conv.id, prev.version, { botStep: prev.phase === "waiting" ? null : 0, state: s, dueAt: due }))) return true;
      await this.d.store.log(conv.id, conv.dealId, s.lang, [{ kind: "blocked", reason: `ai_error: ${why}`.slice(0, 200) }]);
      await this.hooks.later(conv.id, due);
      return false;
    }
    const s: BotState = { ...base, ai, phase: "done", outcome: "handoff", reason: "question", asking: null, version: prev.version + 1 };
    if (!(await this.d.store.save(conv.id, prev.version, { botStep: BOT_DONE, state: s, dueAt: null }))) return true;
    const text = botSellText(s, env, "handoff");
    if (text) await this.send(conv, text);
    await this.d.store.log(conv.id, conv.dealId, s.lang, [{ kind: "blocked", reason: `ai_error: ${why}`.slice(0, 200) }, { kind: "handoff", reason: "ai_error" }]);
    await this.hooks.finish(conv, s, fields);
    return false;
  }
}
