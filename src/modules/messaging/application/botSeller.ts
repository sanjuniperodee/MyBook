import { phoneTail } from "@/shared/domain/phone";
import {
  BOT_DONE,
  allowedAmounts,
  allowedPercents,
  checkSellerReply,
  problemsText,
  botSellText,
  botSummary,
  classifyInputs,
  mediaCaption,
  newBotState,
  newSellerAiState,
  deadlineFact,
  faqNotes,
  clientSaysPaid,
  findSensitive,
  paymentAmounts,
  isGreetingOnly,
  lastBotTurn,
  mediaLine,
  parseSellerDecision,
  preview,
  priceMentioned,
  readBotState,
  readSellerAi,
  resolveSellerTurn,
  sellerSchema,
  sellerSystemPromptParts,
  sellerTranscript,
  sellerUserPrompt,
  splitReply,
  materialsAlreadySent,
  isWarmLead,
  WARM_FIRST_FOLLOW_UP_MS,
  materialsFor,
  materialsSummary,
  type BotLang,
  withMediaText,
  SELLER_MAX_FOLLOW_UPS,
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
  type SellerAiState,
  type SellerStage,
  type SellerTurn,
} from "../domain";
import { BOT_ABANDON_MS, BOT_PAUSE_MS } from "./botTiming";
import type { BotPreviewInput, BotPreviewResult } from "./botPreview";
import type { QualifierBotDeps } from "./bot";

/** Сколько модель думает над одним ответом: клиент ждёт в чате. */
export const SELLER_TIMEOUT_MS = 30_000;
/** Сколько модель распознаёт голосовое/фото (расшифровка, описание). */
export const SELLER_MEDIA_TIMEOUT_MS = 25_000;
/** Сколько ждать продолжения, если клиент посреди беседы написал только «Здравствуйте». */
export const GREETING_WAIT_MS = 25_000;
/** Сколько вложений за ход распознаём и какого размера (голосовое WhatsApp на минуту — ~100 КБ). */
const MEDIA_PER_TURN = 3;
const MEDIA_MAX_BYTES = 10_000_000;
/** Инструкция распознаванию: только текст, который дальше идёт в беседу как слова клиента. */
export const SELLER_MEDIA_PROMPT = {
  audio: "Это голосовое сообщение клиента из WhatsApp (русский или казахский, бывает вперемешку). Верни дословную расшифровку на языке оригинала — только текст, без кавычек и пояснений. Речь неразборчива — верни пустую строку.",
  image:
    "Это фото, которое клиент прислал в WhatsApp компании, делающей персональные книги-подарки. Опиши кратко (1–2 предложения), что на нём и зачем клиент мог его прислать. Если это чек или скриншот оплаты (Kaspi, перевод) — начни ответ словами «Чек об оплате» и укажи сумму, если она видна. Номера телефонов и карт не переписывай. Верни только текст.",
} as const;
/** Через сколько повторить ход после сбоя модели; на второй сбой беседу берёт менеджер. */
export const SELLER_RETRY_MS = 60_000;
export const SELLER_MAX_FAILURES = 2;
/** Сколько последних сообщений переписки видит модель. */
const HISTORY_LIMIT = 60;
/** Сколько последних сообщений клиента задают тему для выбора кусков базы знаний. */
const KNOWLEDGE_QUERY_MESSAGES = 3;

/** Черновик ответа для менеджера («Подсказать ответ» в чате): текст, заметка о клиенте и этап — или почему не вышло. */
export type CopilotSuggestion = { text: string; summary: string; stage: SellerStage } | { error: string };

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
    // Голосовые и фото: модель распознавания превращает их в текст — бот отвечает на них, как на обычные сообщения.
    const media = await this.recognizeMedia(readSellerAi(state.ai), fresh, config.sell.media);
    const inputs2 = media.inputs;
    const c = classifyInputs(inputs2);

    const start = state.phase === "waiting";
    // Начало беседы — в журнал (статистика: «Начал беседу», языки, конверсия); подхват начатой переписки — отдельным
    // событием. Язык известен после ответа модели; без него (сбой модели, голосовое) — тот, что был.
    const opening = (lang: BotLang): BotEvent[] => (start ? [{ kind: "started", reason: lang }, ...(readSellerAi(state.ai).takeover ? [{ kind: "takeover" as const }] : [])] : []);
    const questions = config.questions.map((q) => q.field).filter((k) => fields.some((f) => f.key === k));
    const waited = conv.awaitingSince ? Math.max(0, Math.round((now.getTime() - new Date(conv.awaitingSince).getTime()) / 60_000)) : 0;
    const base: BotState = start
      ? { ...state, phase: "active", startedAt: now.toISOString(), questions, first: preview(c.texts[0] ?? (c.voice ? "🎤" : c.media ? "📷" : "")), ai: { ...media.ai, waitedMinutes: state.ai.takeover ? waited : 0 } }
      : { ...state, ai: media.ai };

    // Бота запустили кнопкой, новых сообщений нет: модель продолжает переписку сама.
    const manual = start && state.reason === "manual";
    // «Здравствуйте!» отдельным сообщением посреди беседы: клиент почти всегда дописывает следом — ждём, чтобы ответить
    // одним сообщением и не здороваться второй раз (чат Алишера, 18.10).
    const newest = Math.max(0, ...inputs2.map((i) => new Date(i.at).getTime()));
    if (!start && inputs2.length && inputs2.every((i) => i.type === "text" && isGreetingOnly(i.text)) && now.getTime() - newest < GREETING_WAIT_MS) {
      await this.hooks.later(conv.id, new Date(newest + GREETING_WAIT_MS));
      return false;
    }

    // Не распозналось (модель не умеет, файла нет): голосовое — просьба написать текстом, фото и файлы — менеджеру.
    if (!c.text && !manual) return this.withoutText(conv, base, state, inputs2, c, env, fields, now, opening);

    let history = await this.d.history!(conv.id, HISTORY_LIMIT);
    // Голосовые клиента до старта бота (подхват, запуск кнопкой) ещё не расшифрованы — расшифровать последние, иначе
    // модель видит «[голосовое сообщение]» и просит пересказать то, что клиент уже сказал.
    const earlier = history
      .slice(-15)
      .filter((m) => m.from === "client" && m.type === "audio" && m.id && /^\[голосовое сообщение\]$/.test(m.text) && !base.ai.media?.[m.id] && !inputs2.some((i) => i.id === m.id))
      .map((m): BotInput => ({ id: m.id!, type: "audio", text: "", at: m.at, mediaUrl: "history" }));
    if (earlier.length) {
      const old = await this.recognizeMedia(readSellerAi(base.ai), earlier.slice(-3), config.sell.media);
      base.ai = old.ai;
      history = await this.d.history!(conv.id, HISTORY_LIMIT);
    }
    const decided = await this.decide({ conv, base, env, config, fields, history, fresh: inputs2, purpose: "reply" });
    if ("error" in decided) return this.failed(conv, base, state, decided.error, env, fields, now, opening);

    // Клиент дописал, пока модель думала: ответ был бы на устаревшее — повторяем ход со всеми сообщениями.
    const latest = await this.d.store.incoming(conv.id, new Date(state.since));
    if (latest.some((i) => !base.seen.includes(i.id) && !fresh.some((f) => f.id === i.id))) return true;

    const result = decided.turn;
    // Подхват: модель решила, что клиент ответа не ждёт («Аха» после ответа менеджера) — бот не вмешивается.
    if (start && readSellerAi(state.ai).takeover && decided.decision.action === "wait" && result.state.phase !== "done") return this.quietTakeover(conv, state, result.state);
    const next: BotState = { ...result.state, engine: "ai", ai: { ...readSellerAi(result.state.ai), failures: 0 } };
    result.state = next;
    // Тёплый клиент: «Ознакомились?» через 20 минут — следующий ход раньше обычных получаса тишины.
    const idle = isWarmLead(next.ai) && config.sell.followUpHours > 0 ? Math.min(WARM_FIRST_FOLLOW_UP_MS, BOT_ABANDON_MS) : BOT_ABANDON_MS;
    const saved = await this.d.store.save(conv.id, state.version, { botStep: result.done ? BOT_DONE : 0, state: next, dueAt: result.done ? null : new Date(now.getTime() + idle) });
    if (!saved) return true;
    await this.apply(conv, state, result, fields, env, opening(next.lang));
    if (!result.done) {
      // Клиент написал, пока бот отвечал: следующий ход после обычной паузы, а не через полчаса.
      const unseen = (await this.d.store.incoming(conv.id, new Date(next.since))).filter((i) => !next.seen.includes(i.id));
      if (unseen.length) await this.hooks.later(conv.id, new Date(Math.max(now.getTime(), ...unseen.map((i) => new Date(i.at).getTime())) + BOT_PAUSE_MS));
    }
    return false;
  }

  /**
   * Голосовые и фото клиента → текст (расшифровка, описание). Распознанное запоминается в состоянии (id → текст): в
   * следующих ходах модель видит слова клиента, а не «[голосовое]». Модель не умеет вложения — флаг mediaFailed, в этой
   * беседе больше не пробуем; временный сбой или файла нет — вложение остаётся как было (старый путь).
   */
  private async recognizeMedia(prev: SellerAiState, fresh: BotInput[], enabled: boolean): Promise<{ inputs: BotInput[]; ai: SellerAiState }> {
    const ai: SellerAiState = { ...prev, media: { ...prev.media } };
    const caption = (i: BotInput) => (i.text.trim() && i.text.trim() !== mediaCaption(i.type) ? i.text.trim() : "");
    const asText = (i: BotInput, line: string): BotInput => ({ ...i, type: "text", text: [line, caption(i)].filter(Boolean).join(" ") });
    const inputs = fresh.map((i) => (ai.media[i.id] ? asText(i, ai.media[i.id]) : i));
    if (!enabled || ai.mediaFailed || !this.d.seller?.media || !this.d.media) return { inputs, ai };
    const todo = inputs.filter((i) => (i.type === "audio" || i.type === "image") && i.mediaUrl).slice(0, MEDIA_PER_TURN);
    for (const m of todo) {
      const file = await this.d.media(m.id).catch(() => null);
      if (!file || !file.data.length || file.data.length > MEDIA_MAX_BYTES) continue;
      const kind = m.type === "image" ? "image" : "audio";
      const res = await this.d.seller
        .media({ system: SELLER_MEDIA_PROMPT[kind], parts: [{ kind, data: Buffer.from(file.data).toString("base64"), mime: file.mime || (kind === "image" ? "image/jpeg" : "audio/ogg") }], timeoutMs: SELLER_MEDIA_TIMEOUT_MS })
        .catch(() => null);
      if (res && "unsupported" in res) {
        ai.mediaFailed = true;
        break;
      }
      const text = res?.text.trim();
      if (!text) continue;
      const line = mediaLine(kind, text);
      if (kind === "audio") await this.d.transcript?.(m.id, text.slice(0, 4000)).catch(() => {});
      // Помним последние распознанные вложения — состояние беседы не растёт без меры.
      ai.media = Object.fromEntries([...Object.entries(ai.media), [m.id, line] as const].slice(-12));
      inputs[inputs.indexOf(m)] = asText(m, line);
    }
    return { inputs, ai };
  }

  /**
   * Напоминание молчащему клиенту: модель решает, уместно ли оно и как написать (как менеджер: «Ознакомились?», на
   * следующий день — «Как ваши дела?»). Клиент уже платил или модель решила промолчать — больше не напоминаем.
   * Следующий шаг (второе напоминание или итог менеджеру) считает квалификатор по lastBotAt.
   */
  async followUp(conv: Conversation, state: BotState, config: BotConfig, fields: DealField[], now: Date): Promise<boolean> {
    const history = await this.d.history!(conv.id, HISTORY_LIMIT);
    const ai = readSellerAi(state.ai);
    const base = await this.hooks.env(conv, config, fields, now);
    const env: BotEnv = { ...base, paid: base.paid || clientSaysPaid(history, ai.media) };
    let reply: string | null = null;
    if (!env.paid) {
      const decided = await this.decide({ conv, base: state, env, config, fields, history, fresh: [], purpose: "follow_up" });
      // Напоминание — необязательная любезность: ошибка модели или спорный текст = молчим, не зовём менеджера.
      const decision = "turn" in decided ? decided.decision : null;
      if (decision && decision.action !== "wait" && decision.reply) {
        const turn = resolveSellerTurn(state, { ...decision, action: "reply", agreed: false, handoff: "none" }, env, this.ctx(conv, env, config, [], history, false, await this.rules(conv, env, config)));
        if (!turn.retry && turn.reply) reply = turn.reply;
      }
    }
    const next: BotState = {
      ...state,
      followedUp: true,
      lastBotAt: reply ? now.toISOString() : state.lastBotAt,
      ai: { ...ai, closeAsked: reply ? false : ai.closeAsked, followUps: reply ? ai.followUps + 1 : SELLER_MAX_FOLLOW_UPS },
      version: state.version + 1,
    };
    if (!(await this.d.store.save(conv.id, state.version, { botStep: 0, state: next, dueAt: new Date(now.getTime() + 60_000) }))) return true;
    if (reply) {
      const current = await this.d.store.load(conv.id);
      if (current?.state?.outcome !== "stopped_by_manager") await this.say(conv, reply);
    }
    await this.d.store.log(conv.id, conv.dealId, next.lang, reply ? [{ kind: "follow_up" }] : []);
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
      } else if (decided.turn.reply && decided.turn.materials) {
        const parts = splitReply(decided.turn.reply);
        const after = decided.turn.materialsAfter ?? 1;
        const list = materialsFor((await this.d.materials?.list().catch(() => [])) ?? [], state.lang);
        transcript.push({ from: "bot", text: [...parts.slice(0, after), `📎 [Здесь бот отправит подборку: ${materialsSummary(list) || "пусто"}]`, ...parts.slice(after)].join("\n\n") });
        history.push({ from: "bot", text: decided.turn.reply, at: ctx.now });
        for (const m of list) history.push({ from: "bot", text: m.caption || m.name, at: ctx.now, type: m.kind });
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

  private async rules(conv: Conversation, env: BotEnv, config: BotConfig, opts: { manager?: boolean } = {}) {
    const knowledge = await this.d.settings.knowledge().catch(() => "");
    const owner = [config.promo.ru, config.promo.kk, knowledge, ...faqNotes(env, !!opts.manager || !config.sell.hidePrices)];
    // Цены называет только менеджер (владелец, 18.10); клиент уже платил — суммы тем более не к месту.
    // Черновик для менеджера — суммы из тарифов и фактов называть можно: их называет он сам.
    const noAmounts = !opts.manager && (config.sell.hidePrices || !!env.paid);
    // Суммы разрешены — можно и те, что есть в оплатах и счетах клиента («принято 10 000», «осталось 20 000»).
    const amounts = noAmounts ? new Set<number>() : allowedAmounts(env.catalog, config.sell, owner);
    if (!noAmounts && env.payments) for (const n of paymentAmounts(env.payments)) amounts.add(n);
    return {
      amounts,
      percents: allowedPercents(owner),
      urls: [env.site.url].filter(Boolean),
      phones: [conv.chatId, conv.meta.phone, await this.d.shopPhone()],
    };
  }

  private ctx(conv: Conversation, env: BotEnv, config: BotConfig, inputs: BotInput[], history: HistoryMessage[], second: boolean, rules: Awaited<ReturnType<AiSeller["rules"]>>, materials = false) {
    // Мы (бот или менеджер) писали за последние 6 часов — уже поздоровались; через сутки «Добрый день!» снова уместно.
    const lastOurs = [...history].reverse().find((m) => m.from !== "client");
    const now = this.d.clock.now().getTime();
    const greeted = !!lastOurs && now - new Date(lastOurs.at).getTime() < 6 * 3_600_000;
    // Представляется только в новом чате: если клиенту уже писали мы (бот или менеджер — подхват, запуск кнопкой), бот не
    // представляется, а продолжает от лица компании (владелец, 18.10: «не обязательно представляться при подхвате»).
    const intro = lastOurs ? null : { greet: true };
    return { inputs, clientText: inputs.map((i) => i.text).join("\n"), priceInHistory: priceMentioned(history), rules, second, lastBotText: lastBotTurn(history), greeted, intro, materials };
  }

  /**
   * Запрос к модели: инструкция (стабильная часть — под кэш провайдера), переписка, срок по дате. Если клиент назвал
   * дату или город — срок считает код и ответ переписывается с этим фактом. Возвращает решение модели и «спросить ещё
   * раз» (с правками после проверки) или ошибку модели. voice — черновик для менеджера, а не ответ бота.
   */
  private async consult(a: { conv: Conversation; base: BotState; env: BotEnv; config: BotConfig; fields: DealField[]; history: HistoryMessage[]; fresh: BotInput[]; purpose: "reply" | "follow_up" | "copilot"; voice?: { manager: string } | null; quick?: boolean }) {
    const { conv, base, config, fields, fresh, purpose } = a;
    const voice = a.voice ?? null;
    const [knowledge, lessons, materialList] = await Promise.all([
      this.d.settings.knowledge().catch(() => ""),
      this.d.settings.lessons?.().catch(() => []) ?? [],
      voice ? [] : (this.d.materials?.list().catch(() => []) ?? []),
    ]);
    const schemaFields = fields.filter((f) => base.questions.includes(f.key));
    const schema = sellerSchema(schemaFields);
    const ai = readSellerAi(base.ai);
    // Распознанные голосовые и фото — словами клиента, а не «[голосовое сообщение]» (и в старых сообщениях тоже).
    const history = withMediaText(a.history, ai.media);
    // Клиент писал «оплатил(а)» или прислал чек — не продаём, даже если оплату по сделке ещё не провели; но и не
    // подтверждаем: денег в CRM нет — проверит менеджер (paidClaimOnly).
    const claimed = clientSaysPaid(history, ai.media);
    const env: BotEnv = { ...a.env, paid: !!a.env.paid || claimed };
    const paid = !!env.paid;
    const paidClaimOnly = claimed && !a.env.paid;
    const rules = await this.rules(conv, env, config, { manager: !!voice });
    // Кто из менеджеров писал клиенту (подпись в CRM): при подхвате бот не называет других имён.
    const chatManager = [...history].reverse().find((m) => m.from === "manager" && m.author)?.author ?? null;
    const dateKey = fields.find((f) => f.type === "date")?.key;
    const knownDate = (dateKey ? dayValue(base.filled[dateKey]) ?? dayValue(env.dealValues[dateKey]) : null) ?? dayValue(ai.eventDate);
    const known = fields
      .filter((f) => f.type !== "checkbox")
      .map((f) => ({ label: f.label, value: base.filled[f.key] ?? env.dealValues[f.key] }))
      .filter((k): k is { label: string; value: string | number } => k.value !== undefined && k.value !== null && k.value !== "")
      .map((k) => ({ label: k.label, value: String(k.value) }));
    // Подборка материалов: есть ли она и уходила ли уже (от бота или — при подхвате — от менеджера).
    const materialsSent = ai.materialsSent || materialsAlreadySent(history);
    const materials = materialsFor(materialList, base.lang).length ? { summary: materialsSummary(materialList), sent: materialsSent } : null;
    const transcript = sellerTranscript(history, fresh.length, env.tz);
    const user = sellerUserPrompt(transcript, purpose, fresh.length > 0);
    // Тема разговора для выбора кусков базы знаний: последние сообщения клиента.
    const knowledgeQuery = history
      .filter((m) => m.from === "client")
      .slice(-KNOWLEDGE_QUERY_MESSAGES)
      .map((m) => m.text)
      .join("\n")
      .slice(0, 1500);

    const ask = async (extraFact: string | null, retry: ReplyProblem[] | null, deadline: string | null): Promise<SellerDecision | { error: string }> => {
      const parts = sellerSystemPromptParts({ env, state: base, questions: base.questions, knowledge, knowledgeQuery, brand: this.d.settings.brand(), known, deadline, takeoverMinutes: ai.takeover ? ai.waitedMinutes : null, chatManager, purpose, extraFact, retry, paid, paidClaimOnly, followUps: ai.followUps, lessons, voice, materials });
      let raw: string;
      try {
        raw = await this.d.seller!.complete({ system: `${parts.stable}\n${parts.dynamic}`, cachePrefix: parts.stable, user, schema: schema as unknown as Record<string, unknown>, timeoutMs: SELLER_TIMEOUT_MS });
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
      const decision = parseSellerDecision(parseJson(raw), schemaFields, env.now, env.tz);
      return decision ?? { error: "ответ модели не по схеме" };
    };

    let deadline = knownDate ? deadlineFact(knownDate, env, ai.city) : null;
    let first = await ask(null, null, deadline);
    // Одна повторная попытка на случай неверного JSON: клиент ждёт, но пустой ход хуже.
    if ("error" in first) first = await ask(null, null, deadline);
    if ("error" in first) return first;
    let decision = first;

    // Клиент назвал дату или город — срок пересчитан кодом (по Алматы доставка в день готовности), ответ — с учётом вердикта.
    const date = decision.eventDate ?? knownDate;
    const newInfo = (decision.eventDate && decision.eventDate !== knownDate) || (decision.city && decision.city !== ai.city);
    if (date && newInfo && purpose !== "follow_up" && !a.quick) {
      const fact = deadlineFact(date, env, decision.city || ai.city);
      if (fact) {
        deadline = fact;
        const again = await ask(null, null, fact);
        if (!("error" in again)) decision = { ...again, eventDate: again.eventDate ?? decision.eventDate, city: again.city || decision.city, fields: { ...decision.fields, ...again.fields } };
      }
    }
    const rewrite = (problems: ReplyProblem[]) => ask(null, problems, deadline);
    return { decision, env, rules, history, rewrite, materials: !!materials && !materials.sent && purpose === "reply" };
  }

  /**
   * Ход бота: решение модели → проверка кодом (суммы, ссылки, номера, право на счёт); нарушение — один раз просим
   * переписать. Возвращает ход или ошибку модели.
   */
  private async decide(a: { conv: Conversation; base: BotState; env: BotEnv; config: BotConfig; fields: DealField[]; history: HistoryMessage[]; fresh: BotInput[]; purpose: "reply" | "follow_up" }): Promise<{ turn: SellerTurn; decision: SellerDecision } | { error: string }> {
    const c = await this.consult(a);
    if ("error" in c) return c;
    const { conv, base, config, fresh: inputs } = a;
    let decision = c.decision;
    let turn = resolveSellerTurn(base, decision, c.env, this.ctx(conv, c.env, config, inputs, c.history, false, c.rules, c.materials));
    if (turn.retry) {
      const rewritten = await c.rewrite(turn.retry);
      if ("error" in rewritten) return rewritten;
      decision = rewritten;
      turn = resolveSellerTurn(base, rewritten, c.env, this.ctx(conv, c.env, config, inputs, c.history, true, c.rules, c.materials));
    }
    return { turn, decision };
  }

  /**
   * Подсказка менеджеру в чате: тот же «мозг», что у продажника (факты, тарифы, срок к дате, поля сделки, уроки), но
   * черновик пишется от лица менеджера и ничего не отправляет и не меняет: менеджер правит и шлёт сам. Проверка та же —
   * суммы только из фактов, ссылки только на сайт, без номеров; нарушение — одна переписка, потом ошибка.
   */
  async suggest(conv: Conversation, manager: string, opts: { quick?: boolean } = {}): Promise<CopilotSuggestion> {
    if (!this.d.seller || !this.d.history || !conv.dealId) return { error: "AI-продажник не подключён" };
    const now = this.d.clock.now();
    const [config, fields] = await Promise.all([this.d.settings.config(), this.d.settings.dealFields()]);
    const env = await this.hooks.env(conv, config, fields, now);
    const rec = await this.d.store.load(conv.id);
    const questions = config.questions.map((q) => q.field).filter((k) => fields.some((f) => f.key === k));
    const saved = rec?.state ?? null;
    const base: BotState = saved ? { ...saved, questions: saved.questions.length ? saved.questions : questions } : { ...newBotState(now, false), engine: "ai", phase: "active", questions, ai: newSellerAiState() };
    const history = await this.d.history(conv.id, HISTORY_LIMIT);
    if (!history.some((m) => m.from === "client" && m.text.trim())) return { error: "Клиент ещё ничего не написал — подсказывать нечего." };
    const c = await this.consult({ conv, base, env, config, fields, history, fresh: [], purpose: "copilot", voice: { manager }, quick: opts.quick });
    if ("error" in c) return c;
    let decision = c.decision;
    // Только оценка «ждёт ли клиент ответа» (triage): текст никуда не уходит — проверять и переписывать его незачем.
    if (opts.quick) return { text: decision.action === "wait" ? "" : decision.reply, summary: decision.summary, stage: decision.stage };
    const check = (d: SellerDecision) => (d.reply ? checkSellerReply(d.reply, c.rules) : []);
    let problems = check(decision);
    if (problems.length) {
      const again = await c.rewrite(problems);
      if ("error" in again) return again;
      decision = again;
      problems = check(decision);
    }
    if (problems.length) return { error: `Подсказка не прошла проверку (${problemsText(problems)}) — ответьте сами.` };
    return { text: decision.action === "wait" ? "" : decision.reply, summary: decision.summary, stage: decision.stage };
  }

  // ─── последствия хода ──────────────────────────────────────────────────────

  private async apply(conv: Conversation, before: BotState, result: SellerTurn, fields: DealField[], env: BotEnv, opening: BotEvent[] = []) {
    const dealId = conv.dealId!;
    for (const [key, value] of Object.entries(result.fields)) await this.d.sales.setField(dealId, key, value);
    const events: BotEvent[] = [...opening, ...result.events];
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
    } else if (result.reply && result.materials) {
      await this.sayWithMaterials(conv, result.reply, final.lang, result.materialsAfter ?? 1);
    } else if (result.reply) {
      await this.say(conv, result.reply);
    }

    await this.d.store.log(conv.id, dealId, final.lang, events);
    if (final.stage === "offer" && before.stage !== "offer") await this.hooks.offered(conv, final, fields);
    if (result.done) await this.hooks.finish(conv, final, fields);
  }

  /** Ответ модели — как пишет человек в WhatsApp: абзацы через пустую строку уходят отдельными сообщениями (до трёх). */
  private async say(conv: Conversation, text: string) {
    for (const part of splitReply(text)) await this.send(conv, part);
  }

  /**
   * Ответ с подборкой — как у менеджера: подводка → фото (WhatsApp склеивает их в альбом) → видео → пример книги →
   * остальное (срок, цена, вопрос). Ответил человек посреди подборки — дальше не шлём.
   */
  private async sayWithMaterials(conv: Conversation, text: string, lang: BotLang, after: number) {
    const parts = splitReply(text);
    for (const part of parts.slice(0, after)) await this.send(conv, part);
    const rest = parts.slice(after);
    const list = materialsFor((await this.d.materials?.list().catch(() => [])) ?? [], lang);
    let sent = 0;
    for (const m of list) {
      const current = await this.d.store.load(conv.id);
      if (current?.state?.outcome === "stopped_by_manager") return;
      if (await this.d.materials!.send(conv.id, m).catch(() => false)) sent++;
    }
    if (list.length && !sent) this.d.logger.error("bot materials", `не ушёл ни один файл из ${list.length}`);
    for (const part of rest) await this.send(conv, part);
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
    if (result.reply) await this.say(conv, result.reply);
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

  /**
   * Подхват не нужен: клиент только подтвердил или поблагодарил, а ответ ему уже дали. Бот молчит, «ждёт ответа»
   * снимается, беседа закрыта мягко — следующее сообщение клиента снова оценит AI.
   */
  private async quietTakeover(conv: Conversation, state: BotState, next: BotState): Promise<boolean> {
    const off: BotState = { ...next, engine: "ai", phase: "done", outcome: "skipped", reason: "no_reply_needed", asking: null };
    if (!(await this.d.store.save(conv.id, state.version, { botStep: null, state: off, dueAt: null }, { restart: true }))) return true;
    if (conv.awaitingSince && (await this.d.conversations.dismissAwaiting(conv.id, new Date(conv.awaitingSince)))) this.d.changed?.(conv.id);
    await this.d.store.log(conv.id, conv.dealId, off.lang, [{ kind: "skipped", reason: "no_reply_needed" }]);
    return false;
  }

  // ─── без текста и сбои ─────────────────────────────────────────────────────

  /** Голосовое, фото или файл: модель их не видит. Голосовое — просим текст (один раз); фото и файлы (чек) — менеджеру. */
  private async withoutText(conv: Conversation, base: BotState, prev: BotState, fresh: BotInput[], c: ReturnType<typeof classifyInputs>, env: BotEnv, fields: DealField[], now: Date, opening: (lang: BotLang) => BotEvent[]): Promise<boolean> {
    const s: BotState = { ...base, seen: [...base.seen, ...fresh.map((i) => i.id)].slice(-200), version: prev.version + 1, ai: { ...readSellerAi(base.ai) } };
    const events: BotEvent[] = opening(s.lang);
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
  private async failed(conv: Conversation, base: BotState, prev: BotState, why: string, env: BotEnv, fields: DealField[], now: Date, opening: (lang: BotLang) => BotEvent[]): Promise<boolean> {
    const ai = readSellerAi(base.ai);
    ai.failures += 1;
    this.d.logger.warn("bot ai", { error: why });
    if (ai.failures < SELLER_MAX_FAILURES) {
      const due = new Date(now.getTime() + SELLER_RETRY_MS);
      const s: BotState = { ...base, ai, version: prev.version + 1 };
      if (!(await this.d.store.save(conv.id, prev.version, { botStep: prev.phase === "waiting" ? null : 0, state: s, dueAt: due }))) return true;
      await this.d.store.log(conv.id, conv.dealId, s.lang, [...opening(s.lang), { kind: "blocked", reason: `ai_error: ${why}`.slice(0, 200) }]);
      await this.hooks.later(conv.id, due);
      return false;
    }
    const s: BotState = { ...base, ai, phase: "done", outcome: "handoff", reason: "question", asking: null, version: prev.version + 1 };
    if (!(await this.d.store.save(conv.id, prev.version, { botStep: BOT_DONE, state: s, dueAt: null }))) return true;
    const text = botSellText(s, env, "handoff");
    if (text) await this.send(conv, text);
    await this.d.store.log(conv.id, conv.dealId, s.lang, [...opening(s.lang), { kind: "blocked", reason: `ai_error: ${why}`.slice(0, 200) }, { kind: "handoff", reason: "ai_error" }]);
    await this.hooks.finish(conv, s, fields);
    return false;
  }
}
