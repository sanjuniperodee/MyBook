import type { Clock, Logger } from "@/shared/application";
import { phoneTail } from "@/shared/domain/phone";
import { zonedDay } from "@/shared/domain/time";
import {
  BOT_DONE,
  abandonBot,
  botFollowUp,
  botSellText,
  offerExpired,
  sellPlan,
  sellerInvoice,
  channelLabel,
  preview,
  botChannelOf,
  botSummary,
  botTurn,
  factsPaid,
  findSensitive,
  newBotState,
  newSellerAiState,
  outcomeTitle,
  readSellerAi,
  SELLER_MAX_FOLLOW_UPS,
  followUpDelayMs,
  isWarmLead,
  lastStartFor,
  sellerEventDate,
  safeName,
  startBlocker,
  themeLabel,
  type BotEnv,
  type BotEvent,
  type BotMaterial,
  type BotInput,
  type BotLang,
  type BotSkipReason,
  type BotState,
  type BotTurn,
  type Conversation,
  type InboundMessage,
  type SellerRemind,
  afterManagerReply,
  autoReplyAllowed,
  pausedNow,
  type BotControl,
  obviouslyNeedsReply,
} from "../domain";
import type { BotBrain, BotCrm, BotHistory, BotInvoices, BotMediaReader, BotSellerModel, BotSettings, BotStore, BotTimers, ConversationRepository, SalesGateway, StaffNotifier, Tasks } from "./ports";
import { AiSeller, workStartOn, type CopilotSuggestion } from "./botSeller";

export { BOT_ABANDON_MS, BOT_AI_TIMEOUT_MS, BOT_MANAGER_ACTIVE_MS, BOT_NEXT_DAY_FOLLOW_UP_MS, BOT_OFFER_IDLE_MS, BOT_PAUSE_MS } from "./botTiming";
import { BOT_ABANDON_MS, BOT_AI_TIMEOUT_MS, BOT_MANAGER_ACTIVE_MS, BOT_NEXT_DAY_FOLLOW_UP_MS, BOT_OFFER_IDLE_MS, BOT_PAUSE_MS } from "./botTiming";

/** Чем закончилась прежняя беседа бота, после чего его можно снова подхватить, если менеджер молчит. */
const RESUMABLE_OUTCOMES = new Set(["stopped_by_manager", "finished", "abandoned", "offered", "skipped", "disabled"]);

export interface QualifierBotDeps {
  conversations: ConversationRepository;
  store: BotStore;
  settings: BotSettings;
  crm: BotCrm;
  sales: SalesGateway;
  notifier: StaffNotifier;
  tasks: Tasks;
  timers: BotTimers;
  clock: Clock;
  logger: Logger;
  /** Отправить клиенту от имени бота; id — записанное сообщение (к нему след хода «Почему так?»). */
  send(conversationId: string, text: string): Promise<{ id: string } | void>;
  /** Внутренняя заметка в чате (итог бота) — клиент её не видит. */
  note(conversationId: string, text: string): Promise<unknown>;
  /** Номер магазина: его бот писать может, остальные номера, карты и реквизиты — нет. */
  shopPhone(): Promise<string>;
  brain?: BotBrain | null;
  /** Счёт от имени бота (режим «Продаёт» со счётом); null — счета выставляет только менеджер. */
  invoices?: BotInvoices | null;
  /** Модель AI-продажника и переписка для неё; без них режим «Продаёт» идёт по шаблонам. */
  seller?: BotSellerModel | null;
  history?: BotHistory["messages"] | null;
  /** Файлы вложений по id сообщения — чтобы продажник распознавал голосовые и фото. */
  media?: BotMediaReader["read"] | null;
  /** Распознанный текст вложения (расшифровка голосового, текст фото или документа) — в сообщение, его видит менеджер. */
  transcript?: ((messageId: string, text: string) => Promise<void>) | null;
  /** Уже распознанный текст вложения (кнопкой «Расшифровать» или прежним ходом) — повторно модель не спрашиваем. */
  recognized?: ((messageId: string) => Promise<string | null>) | null;
  /** Диалог изменился без сообщения (AI снял «ждёт ответа») — обновить экран чатов. */
  changed?: ((conversationId: string) => void) | null;
  /** Подборка материалов владельца (фото, видео, пример книги) и отправка файла клиенту от имени бота. */
  materials?: BotMaterialsPort | null;
  /** Клиент просил не писать первым (стоп-лист): на его сообщения бот отвечает, но сам не напоминает о себе. */
  noMarketing?: ((conv: Conversation) => Promise<boolean>) | null;
}

/** Материалы для клиента: список из настроек и отправка одного файла (false — не ушёл). */
export interface BotMaterialsPort {
  list(): Promise<BotMaterial[]>;
  send(conversationId: string, material: BotMaterial): Promise<boolean>;
}

/** Через сколько после сообщения клиента AI решает, ждёт ли он ответа (менеджер мог ответить сам — тогда не спрашиваем). */
export const TRIAGE_DELAY_MS = 2 * 60_000;

/**
 * Бот-квалификатор: на новое обращение здоровается, отвечает на частые вопросы, спрашивает недостающее из вопросов
 * настроек и записывает ответы в поля сделки. Молчит, как только ответил человек (из CRM или с телефона), и не
 * начинает, если это не новый клиент (заказ, книга, сделка в работе, переписка до CRM) или канал выключен. Отвечает
 * после паузы в сообщениях клиента — одним сообщением. Режим: off | always | off_hours | fallback (если менеджер не
 * ответил за N минут; вне рабочего времени — сразу).
 */
export class QualifierBot {
  readonly #running = new Set<string>();
  readonly #seller: AiSeller;

  constructor(private readonly d: QualifierBotDeps) {
    this.#seller = new AiSeller(
      { ...d, media: d.media ?? null },
      {
        env: (conv, config, fields, now) => this.env(conv, config, fields, now),
        finish: (conv, state, fields) => this.finish(conv, state, fields),
        offered: (conv, state, fields) => this.offered(conv, state, fields),
        later: (conversationId, due) => this.later(conversationId, due),
      },
    );
  }

  /** Тест-режим на настоящей модели продажника (настройки бота → «Проверить диалог»). null — продажник не включён или нет модели. */
  async previewAi(input: Parameters<AiSeller["preview"]>[0], ctx: Parameters<AiSeller["preview"]>[1]) {
    return (await this.aiEngine(input.config)) ? this.#seller.preview(input, ctx) : null;
  }

  /**
   * Подсказка менеджеру в чате на «мозге» продажника (факты, тарифы, срок, поля сделки, уроки) — от лица менеджера.
   * null — модели продажника нет или диалог не привязан к сделке: подсказку даст обычный AI-помощник.
   */
  async suggestReply(conversationId: string, manager: string): Promise<CopilotSuggestion | null> {
    const conv = await this.d.conversations.findById(conversationId);
    if (!conv?.dealId || !(await this.#seller.available())) return null;
    return this.#seller.suggest(conv, manager);
  }

  /** Беседу ведёт AI-продажник: режим «Продаёт» с движком AI и подключённая модель. */
  private async aiEngine(config: BotEnv["config"]) {
    return config.sell.on && config.sell.engine === "ai" && (await this.#seller.available());
  }

  /**
   * Входящее сообщение (инбокс вызывает после записи сообщения). quiet — бот ведёт диалог: уведомление на каждое
   * сообщение клиента не нужно, менеджер получит итог.
   */
  async onIncoming(conv: Conversation, m: InboundMessage, opts: { created: boolean; dealCreated: boolean }): Promise<{ quiet: boolean }> {
    const r = await this.incoming(conv, m, opts);
    // Бот этот диалог не ведёт и не подхватит (заказ у клиента, подхват выключен, бот остановлен кнопкой…): ждёт ли
    // клиент ответа на «Аха» или «спасибо», через пару минут решит AI — и снимет «ждёт ответа», если нет.
    // Вопрос или просьба — ответ нужен заведомо: AI не спрашиваем (экономия токенов); спрашиваем про короткие реакции.
    if (!r.handled && !opts.created && conv.dealId && m.type === "text" && !obviouslyNeedsReply(m.text)) this.d.timers.schedule(`triage:${conv.id}`, new Date(this.d.clock.now().getTime() + TRIAGE_DELAY_MS), () => void this.triage(conv.id).catch((err) => this.d.logger.error("bot triage", err)));
    return { quiet: r.quiet };
  }

  /**
   * Ждёт ли клиент ответа: AI читает переписку (как подсказка менеджеру) и, если ответ не нужен («Аха», «Иә түсінікті»,
   * «спасибо» после ответа менеджера), снимает «ждёт ответа». Клиенту ничего не пишет. true — ожидание снято.
   */
  async triage(conversationId: string): Promise<boolean> {
    const conv = await this.d.conversations.findById(conversationId);
    if (!conv?.dealId || !conv.awaitingSince) return false;
    if ((await this.d.settings.mode()) === "off") return false;
    const rec = await this.d.store.load(conv.id);
    // Бот ведёт беседу или собирается подхватить — решит он сам.
    if (rec?.state && rec.state.phase !== "done" && rec.botStep !== BOT_DONE) return false;
    if (!(await this.#seller.available())) return false;
    const config = await this.d.settings.config();
    const r = await this.#seller.suggest(conv, config.sell.managerName, { quick: true });
    if ("error" in r || r.text) return false;
    if (!(await this.d.conversations.dismissAwaiting(conv.id, new Date(conv.awaitingSince)))) return false;
    this.d.changed?.(conv.id);
    await this.d.store.log(conv.id, conv.dealId, null, [{ kind: "skipped", reason: "no_reply_needed" }]);
    return true;
  }

  /** handled — бот ведёт беседу или запланировал ход (ответ или подхват); иначе о «ждёт ответа» решает triage. */
  private async incoming(conv: Conversation, m: InboundMessage, opts: { created: boolean; dealCreated: boolean }): Promise<{ quiet: boolean; handled: boolean }> {
    const no = { quiet: false, handled: false };
    if (conv.botStep === BOT_DONE || !conv.dealId) return no;
    const mode = await this.d.settings.mode();
    if (mode === "off") return no;
    const now = this.d.clock.now();
    const rec = await this.d.store.load(conv.id);
    const state = rec?.state ?? null;
    // Режим чата: менеджер перехватил (днём бот молчит), пауза, отключено вручную — сообщение остаётся в истории, бот не
    // отвечает и закрывает начатую беседу (ночью начатая беседа в перехваченном чате дальше не идёт днём).
    if (!(await this.allowed(rec?.control ?? null, now))) {
      if (state && state.phase !== "done") await this.d.store.stop(conv.id, "human_takeover", { soft: true });
      return no;
    }
    if (state?.phase === "active") {
      await this.later(conv.id, new Date(now.getTime() + BOT_PAUSE_MS));
      return { quiet: true, handled: true };
    }
    if (state?.phase === "waiting") {
      // Пауза сдвигается с каждым сообщением; срок ожидания менеджера (fallback) — нет. Пока бот ждёт только паузу,
      // о первом сообщении менеджер уже знает — серия «Здравствуйте / хочу узнать цену» не даёт уведомления на каждое;
      // пока бот ждёт ответа человека (fallback), уведомления идут как обычно.
      await this.later(conv.id, new Date(Math.max(rec?.dueAt?.getTime() ?? 0, now.getTime() + BOT_PAUSE_MS)));
      return { quiet: !state.waitHuman, handled: true };
    }
    // Бот замолчал не навсегда: менеджер ответил, анкета шаблонного бота закончилась, клиент замолкал — если клиент снова
    // пишет, а менеджер не отвечает, AI-продажник подхватит (takeover). Окончательно — только «Остановить бота» кнопкой,
    // передача менеджеру (handoff), отказ клиента и выставленный счёт.
    const softStopped = !!state && state.phase === "done" && !!state.outcome && RESUMABLE_OUTCOMES.has(state.outcome) && state.reason !== "button";
    if (state && !softStopped) return no;
    // Диалог, начатый прежней версией бота (без состояния), не продолжаем: вопросы могли уйти поверх человека.
    if (!state && conv.botStep !== null) {
      await this.d.conversations.advanceBot(conv.id, conv.botStep, BOT_DONE);
      return no;
    }
    if (!opts.created) return { quiet: false, handled: await this.takeover(conv, m, state, mode, now) };

    const [config, fields, workTime] = await Promise.all([this.d.settings.config(), this.d.settings.dealFields(), this.d.settings.isWorkTime(now)]);
    const channel = botChannelOf(conv.channel);
    const ai = await this.aiEngine(config);
    const questions = config.questions.filter((q) => fields.some((f) => f.key === q.field)).length;
    const fresh = newBotState(new Date(m.at.getTime() - 1000), opts.dealCreated);
    if (ai) fresh.engine = "ai";
    let reason: BotSkipReason | null = !channel || !config.channels.includes(channel) ? "channel" : !questions && !ai ? "no_questions" : mode === "off_hours" && workTime ? "work_time" : null;
    if (!reason) {
      // Клиент с заказом, книгой или сделкой в работе — без опроса (первые сообщения проверяются перед стартом).
      const [deal, client] = await Promise.all([this.d.crm.deal(conv.dealId), conv.clientId ? this.d.crm.client(conv.clientId) : null]);
      reason = startBlocker({ channelOk: true, questions: ai ? Math.max(1, questions) : questions, deal: deal && { ...deal, assigned: !!deal.assigneeId }, fresh: opts.dealCreated, client, priorChat: false, inputs: [] });
    }
    if (reason) {
      await this.skip(conv, fresh, null, reason);
      return no;
    }
    fresh.waitHuman = mode === "fallback" && workTime;
    const due = new Date(now.getTime() + (fresh.waitHuman ? config.waitMinutes * 60_000 : BOT_PAUSE_MS));
    const saved = await this.d.store.save(conv.id, state?.version ?? null, { botStep: null, state: { ...fresh, version: (state?.version ?? -1) + 1 }, dueAt: due }, { restart: !!state });
    if (saved) this.d.timers.schedule(conv.id, due, () => void this.process(conv.id));
    return { quiet: false, handled: saved };
  }

  /**
   * Подхват начатой переписки: клиент написал в диалог, который бот не вёл (менеджер уже общался, переписка началась до
   * бота или бот замолчал после ответа менеджера), и менеджер не отвечает. Бот ждёт waitMinutes (вне рабочего времени —
   * только паузу) и, если «ждёт ответа» осталось, продолжает беседу с места, где остановились: модель читает всю переписку.
   */
  private async takeover(conv: Conversation, m: InboundMessage, state: BotState | null, mode: string, now: Date): Promise<boolean> {
    const none = false;
    const [config, workTime] = await Promise.all([this.d.settings.config(), this.d.settings.isWorkTime(now)]);
    if (!config.sell.takeover || !(await this.aiEngine(config))) return none;
    const channel = botChannelOf(conv.channel);
    if (!channel || !config.channels.includes(channel)) return none;
    // Менеджер уже ответил (или закрыл чат) — подхватывать нечего. Нужен ли ответ на «Аха» или «спасибо», решит модель.
    if (!conv.awaitingSince) return none;
    // AI возобновили в этом чате вручную — отвечает и днём, не дожидаясь менеджера (и в режиме «только вне рабочего времени»).
    const resumed = (await this.d.store.load(conv.id))?.control?.mode === "active";
    if (mode === "off_hours" && workTime && !resumed) return none;
    const [deal, client] = await Promise.all([this.d.crm.deal(conv.dealId!), conv.clientId ? this.d.crm.client(conv.clientId) : null]);
    if (this.takeoverBlocker(deal, client)) return none;
    const awaiting = new Date(conv.awaitingSince);
    // Ночью бот подхватывает сразу — но не когда менеджер сейчас в чате (писал только что): тогда ждёт, как днём.
    const waitHuman = !resumed && (workTime || (await this.managerActive(conv.id, now)));
    const due = new Date(Math.max(now.getTime() + BOT_PAUSE_MS, waitHuman ? awaiting.getTime() + config.waitMinutes * 60_000 : 0));
    const next: BotState = {
      ...newBotState(new Date(awaiting.getTime() - 1000), false),
      engine: "ai",
      waitHuman,
      reason: "takeover",
      ai: { ...newSellerAiState(), takeover: true },
      version: (state?.version ?? -1) + 1,
    };
    const saved = await this.d.store.save(conv.id, state?.version ?? null, { botStep: null, state: next, dueAt: due }, { restart: true });
    if (saved) this.d.timers.schedule(conv.id, due, () => void this.process(conv.id));
    return saved;
  }

  /** Менеджер писал клиенту в последние BOT_MANAGER_ACTIVE_MS — он в чате, бот не перебивает. */
  private async managerActive(conversationId: string, now: Date): Promise<boolean> {
    const history = await this.d.history?.(conversationId, 30).catch(() => null);
    return !!history?.some((m) => m.from === "manager" && now.getTime() - new Date(m.at).getTime() < BOT_MANAGER_ACTIVE_MS);
  }

  /** Сколько ещё ждать менеджера: answered — «ждёт ответа» уже нет (ответил или закрыл чат); Date — до какого момента; null — пора. */
  private takeoverWait(conv: Conversation, state: BotState, config: BotEnv["config"], now: Date): "answered" | Date | null {
    if (!conv.awaitingSince) return "answered";
    if (!state.waitHuman) return null;
    const at = new Date(new Date(conv.awaitingSince).getTime() + config.waitMinutes * 60_000);
    return at.getTime() > now.getTime() + 500 ? at : null;
  }

  /** Подхватывать нельзя: нет сделки, она закрыта или по ней заказ, у клиента уже есть заказы (это уже не продажа). */
  private takeoverBlocker(deal: Awaited<ReturnType<BotCrm["deal"]>>, client: Awaited<ReturnType<BotCrm["client"]>>): BotSkipReason | null {
    if (!deal) return "no_deal";
    if (deal.orderId || (client?.orders ?? 0) > 0) return "client_has_order";
    if (deal.closed) return "deal_closed";
    return null;
  }

  /** Бот ведёт диалог или собирается (правило-автоответ в такой диалог не пишет — иначе клиенту два ответа). */
  async isActive(conversationId: string) {
    const rec = await this.d.store.load(conversationId);
    return !!rec?.state && rec.state.phase !== "done" && rec.botStep !== BOT_DONE;
  }

  /**
   * Человек ответил клиенту (с телефона или из CRM) или нажал «Отключить AI»: бот больше не пишет. Ответ менеджера
   * переводит чат в «менеджер ведёт диалог» (human): днём бот здесь не отвечает, пока AI не возобновят вручную; кнопка —
   * «отключено вручную» (disabled): не отвечает и ночью. Начатая генерация ответа не уйдёт: состояние закрыто, а отправка
   * проверяет его перед каждым сообщением.
   */
  async stopByHuman(conversationId: string, reason = "reply", by: string | null = null) {
    const now = this.d.clock.now();
    const stopped = await this.d.store.stop(conversationId, reason, { soft: reason !== "button" });
    if (reason === "button") await this.d.store.setControl?.(conversationId, { mode: "disabled", until: null, by, at: now.toISOString(), reason });
    else {
      const next = afterManagerReply(null, now, by, reason);
      if (next) await this.d.store.markHuman?.(conversationId, next);
    }
    // Запланированный ход снимается сразу (срок в базе снят остановкой выше).
    this.d.timers.cancel?.(conversationId);
    if (stopped) await this.d.store.log(conversationId, null, null, [{ kind: "stopped_by_manager", reason }]).catch((err) => this.d.logger.error("bot log", err));
    return stopped;
  }

  /** Может ли бот сейчас отвечать в чате с таким режимом (рабочее время — по поясу магазина). */
  private async allowed(control: BotControl | null, now: Date) {
    if (!control) return true;
    const [workTime, humanNight, humanHold] = await Promise.all([this.d.settings.isWorkTime(now), this.d.settings.humanNight?.() ?? true, this.d.settings.humanHold?.() ?? true]);
    return autoReplyAllowed(control, now, { workTime, humanNight, humanHold });
  }

  /**
   * «Возобновить AI»: режим active (снимается и остановка кнопкой), старые сроки — сбрасываются. Клиент ждёт ответа —
   * бот сразу отвечает на накопленные сообщения (только на те, что после последнего ответа: уже отвеченные не повторяет),
   * читая всю переписку. false — AI-продажник не подключён (режим всё равно включён — ответит, когда подключат).
   */
  async resume(conversationId: string, by: string | null) {
    const now = this.d.clock.now();
    if (!(await this.d.store.setControl?.(conversationId, { mode: "active", until: null, by, at: now.toISOString(), reason: "resume" }, { enable: true, dueAt: null }))) throw new Error("Диалог не найден");
    await this.d.store.log(conversationId, null, null, [{ kind: "skipped", reason: "ai_resumed" }]).catch((err) => this.d.logger.error("bot log", err));
    return this.answerPending(conversationId, now);
  }

  /** Клиент ждёт ответа — беседа на накопленные сообщения сразу (после паузы BOT_PAUSE_MS не ждём: менеджер сам включил AI). */
  private async answerPending(conversationId: string, now: Date, run = true): Promise<boolean> {
    const conv = await this.d.conversations.findById(conversationId);
    if (!conv?.dealId || !conv.awaitingSince || (await this.d.settings.mode()) === "off") return false;
    const config = await this.d.settings.config();
    if (!(await this.aiEngine(config))) return false;
    const channel = botChannelOf(conv.channel);
    if (!channel || !config.channels.includes(channel)) return false;
    const rec = await this.d.store.load(conversationId);
    if (rec?.state && rec.state.phase !== "done") return false;
    const awaiting = new Date(conv.awaitingSince);
    const next: BotState = { ...newBotState(new Date(awaiting.getTime() - 1000), false), engine: "ai", waitHuman: false, reason: "takeover", ai: { ...newSellerAiState(), takeover: true }, version: (rec?.state?.version ?? -1) + 1 };
    if (!(await this.d.store.save(conversationId, rec?.state?.version ?? null, { botStep: null, state: next, dueAt: now }, { restart: true }))) return false;
    if (run) await this.process(conversationId);
    return true;
  }

  /** «Пауза AI» до момента until: начатая беседа закрывается, в until бот проснётся (сроком планировщика) и ответит, если клиент ждёт. */
  async pause(conversationId: string, until: Date, by: string | null) {
    const now = this.d.clock.now();
    if (until.getTime() <= now.getTime()) throw new Error("Пауза должна закончиться в будущем");
    await this.d.store.stop(conversationId, "pause", { soft: true });
    await this.d.store.setControl?.(conversationId, { mode: "paused", until: until.toISOString(), by, at: now.toISOString(), reason: "pause" }, { dueAt: until });
    this.d.timers.schedule(conversationId, until, () => void this.process(conversationId));
    await this.d.store.log(conversationId, null, null, [{ kind: "skipped", reason: "ai_paused" }]).catch((err) => this.d.logger.error("bot log", err));
  }

  /** «Отключить AI» вручную: не отвечает ни днём, ни ночью, пока не возобновят. */
  disable(conversationId: string, by: string | null) {
    return this.stopByHuman(conversationId, "button", by);
  }

  /** Запустить бота вручную (кнопка в чате): поздоровается и спросит недостающее. */
  async startManually(conversationId: string) {
    const conv = await this.d.conversations.findById(conversationId);
    if (!conv?.dealId) throw new Error("Сначала привяжите диалог к сделке");
    const rec = await this.d.store.load(conversationId);
    if (rec?.state && rec.state.phase !== "done" && rec.botStep !== BOT_DONE) throw new Error("Бот уже ведёт этот диалог");
    const now = this.d.clock.now();
    const prev = rec?.state?.version ?? null;
    const config = await this.d.settings.config();
    const state: BotState = { ...newBotState(now, false), reason: "manual", version: (prev ?? -1) + 1, engine: (await this.aiEngine(config)) ? "ai" : "template" };
    if (!(await this.d.store.save(conversationId, prev, { botStep: null, state, dueAt: now }, { restart: true }))) throw new Error("Диалог только что изменился — попробуйте ещё раз");
    await this.process(conversationId);
  }

  /** Фоновый проход (раз в минуту): отложенные ходы, ожидание менеджера, брошенные опросы. */
  async sweep(limit = 50) {
    const ids = await this.d.store.due(this.d.clock.now(), limit);
    // Ход AI-продажника может идти десятки секунд: диалоги обрабатываются по четыре, а не по одному, иначе очередь встанет.
    for (let i = 0; i < ids.length; i += 4) await Promise.all(ids.slice(i, i + 4).map((id) => this.process(id)));
    return ids.length;
  }

  /** Ход бота по диалогу: всё, что клиент написал с прошлого хода, — одним ответом. Ошибка не роняет вызывающего. */
  async process(conversationId: string): Promise<void> {
    if (this.#running.has(conversationId)) return;
    this.#running.add(conversationId);
    try {
      // Параллельный ход или ответ человека изменил состояние — перечитать и решить заново.
      for (let attempt = 0; attempt < 3 && (await this.turn(conversationId)); attempt++);
    } catch (err) {
      this.d.logger.error("bot", err);
    } finally {
      this.#running.delete(conversationId);
    }
  }

  private async later(conversationId: string, due: Date) {
    await this.d.store.setDue(conversationId, due);
    this.d.timers.schedule(conversationId, due, () => void this.process(conversationId));
  }

  private async skip(conv: Conversation, state: BotState, version: number | null, reason: BotSkipReason) {
    const done: BotState = { ...state, phase: "done", outcome: "skipped", reason, version: (version ?? -1) + 1 };
    if (await this.d.store.save(conv.id, version, { botStep: BOT_DONE, state: done, dueAt: null })) await this.d.store.log(conv.id, conv.dealId, null, [{ kind: "skipped", reason }]);
  }

  /** true — состояние изменилось параллельно, ход надо повторить. */
  private async turn(conversationId: string): Promise<boolean> {
    const now = this.d.clock.now();
    const rec = await this.d.store.load(conversationId);
    const state = rec?.state;
    // Пауза кончилась (срок планировщика): режим — снова по общим правилам; клиент ждёт ответа — бот отвечает.
    if (rec?.control?.mode === "paused" && !pausedNow(rec.control, now)) {
      // Ход уже идёт (process): новая беседа начнётся на следующем круге этого же прохода.
      return (await this.d.store.setControl?.(conversationId, null, { dueAt: null, expectMode: "paused" })) ? this.answerPending(conversationId, now, false) : false;
    }
    if (!rec || !state || state.phase === "done" || rec.botStep === BOT_DONE) return false;
    // Режим чата сменился, пока ход ждал (менеджер перехватил днём, пауза, отключение) — беседа закрывается без ответа.
    if (!(await this.allowed(rec.control ?? null, now))) {
      await this.d.store.stop(conversationId, "human_takeover", { soft: true });
      return false;
    }
    if (rec.dueAt && rec.dueAt.getTime() > now.getTime() + 500) {
      this.d.timers.schedule(conversationId, rec.dueAt, () => void this.process(conversationId));
      return false;
    }
    const conv = await this.d.conversations.findById(conversationId);
    if (!conv?.dealId) return false;
    const mode = await this.d.settings.mode();
    if (mode === "off") {
      const off: BotState = { ...state, phase: "done", outcome: "disabled", asking: null, version: state.version + 1 };
      return !(await this.d.store.save(conversationId, state.version, { botStep: BOT_DONE, state: off, dueAt: null }));
    }
    const [config, fields, inputs] = await Promise.all([this.d.settings.config(), this.d.settings.dealFields(), this.d.store.incoming(conversationId, new Date(state.since))]);

    if (state.phase === "waiting" && state.reason === "takeover") {
      // Менеджер так и не ответил? Ответил/закрыл чат — бот не вмешивается (но следующее молчание подхватит снова).
      const wait = this.takeoverWait(conv, state, config, now);
      if (wait === "answered") {
        const off: BotState = { ...state, phase: "done", outcome: "stopped_by_manager", reason: "answered", asking: null, version: state.version + 1 };
        return !(await this.d.store.save(conversationId, state.version, { botStep: null, state: off, dueAt: null }, { restart: true }));
      }
      if (wait) {
        await this.later(conversationId, wait);
        return false;
      }
      const [deal, client] = await Promise.all([this.d.crm.deal(conv.dealId), conv.clientId ? this.d.crm.client(conv.clientId) : null]);
      const blocked = this.takeoverBlocker(deal, client) ?? (!(await this.aiEngine(config)) || !config.sell.takeover ? ("disabled" as BotSkipReason) : null);
      if (blocked) {
        const off: BotState = { ...state, phase: "done", outcome: "stopped_by_manager", reason: "answered", asking: null, version: state.version + 1 };
        await this.d.store.log(conversationId, conv.dealId, null, [{ kind: "skipped", reason: blocked }]);
        return !(await this.d.store.save(conversationId, state.version, { botStep: null, state: off, dueAt: null }, { restart: true }));
      }
    } else if (state.phase === "waiting" && state.reason !== "manual") {
      const reason = await this.gate(conv, state, inputs, mode, now);
      if (reason) {
        await this.skip(conv, state, state.version, reason);
        // Пока бот ждал паузу, о сообщениях после первого менеджер не узнавал — раз бот молчит, одно уведомление о них.
        const later = state.waitHuman ? [] : inputs.slice(1);
        if (later.length)
          await this.d.notifier.notify(conv.assigneeId, "chats.view", {
            kind: "message",
            title: `${conv.contactName || phoneTail(conv.chatId) || conv.chatId} · ${channelLabel(conv.channel)}`,
            body: preview(later.map((i) => i.text).join(" · ")),
            link: `/admin/chats?c=${conv.id}`,
          });
        return false;
      }
    }
    const fresh = inputs.filter((i) => !state.seen.includes(i.id));
    // Клиент молчит: после предложения (или в любой беседе AI-продажника) — напоминания, затем итог менеджеру.
    if (state.phase === "active" && !fresh.length && (state.stage === "offer" || state.engine === "ai")) return this.offerIdle(conv, state, config, fields, now, inputs);
    if (state.phase === "active" && !fresh.length) {
      const last = new Date(state.lastBotAt ?? state.startedAt ?? state.since).getTime();
      if (now.getTime() - last < BOT_ABANDON_MS) {
        await this.d.store.setDue(conversationId, new Date(last + BOT_ABANDON_MS));
        return false;
      }
      const { state: next, events } = abandonBot(state);
      if (!(await this.d.store.save(conversationId, state.version, { botStep: BOT_DONE, state: next, dueAt: null }))) return true;
      await this.d.store.log(conversationId, conv.dealId, next.lang, events);
      await this.finish(conv, next, fields);
      return false;
    }

    // Беседу ведёт AI-продажник (режим «Продаёт», движок AI): модель понимает клиента и отвечает, код проверяет.
    if (state.engine === "ai") return this.#seller.turn(conv, state, config, fields, now);

    const env = await this.env(conv, config, fields, now);
    let turn = botTurn(state, inputs, env);
    if (turn.unclear && config.ai && this.d.brain) {
      const hints = await this.understand(state, inputs, env).catch((err) => (this.d.logger.warn("bot ai", { error: String(err) }), null));
      if (hints) turn = botTurn(state, inputs, { ...env, hints });
    }
    const asking = turn.state.asking ? turn.state.questions.indexOf(turn.state.asking) : 0;
    const saved = await this.d.store.save(conversationId, state.version, {
      botStep: turn.done ? BOT_DONE : Math.max(0, asking),
      state: turn.state,
      dueAt: turn.done ? null : new Date(now.getTime() + BOT_ABANDON_MS),
    });
    if (!saved) return true;
    await this.apply(conv, state, turn, fields, env);
    if (!turn.done) {
      // Клиент написал, пока бот думал (ход уже прочитал входящие и сдвинул срок на «клиент замолчал»), — новое
      // сообщение не ждёт 30 минут: следующий ход после обычной паузы.
      const unseen = (await this.d.store.incoming(conversationId, new Date(turn.state.since))).filter((i) => !turn.state.seen.includes(i.id));
      if (unseen.length) await this.later(conversationId, new Date(Math.max(now.getTime(), ...unseen.map((i) => new Date(i.at).getTime())) + BOT_PAUSE_MS));
    }
    return false;
  }

  /** Перед первым ответом: режим, канал, клиент и сделка, переписка до CRM, первые сообщения. */
  private async gate(conv: Conversation, state: BotState, inputs: BotInput[], mode: string, now: Date): Promise<BotSkipReason | null> {
    if (mode === "off_hours" && (await this.d.settings.isWorkTime(now))) return "work_time";
    const [config, fields, deal, client] = await Promise.all([
      this.d.settings.config(),
      this.d.settings.dealFields(),
      this.d.crm.deal(conv.dealId!),
      conv.clientId ? this.d.crm.client(conv.clientId) : null,
    ]);
    const channel = botChannelOf(conv.channel);
    let reason = startBlocker({
      channelOk: !!channel && config.channels.includes(channel),
      questions: config.questions.filter((q) => fields.some((f) => f.key === q.field)).length,
      deal: deal && { ...deal, assigned: !!deal.assigneeId },
      fresh: state.fresh,
      client,
      priorChat: false,
      inputs,
    });
    // Первое сообщение — голосовое или фото: AI-продажник с распознаванием отвечает на него (шаблонный бот — как раньше молчит).
    if (reason === "media_only" && state.engine === "ai" && config.sell.media) reason = null;
    if (reason) return reason;
    const prior = await this.d.crm.priorChat(conv, new Date(state.since)).catch((err) => (this.d.logger.warn("bot prior chat", { error: String(err) }), false));
    return prior ? "prior_chat" : null;
  }

  private async env(conv: Conversation, config: BotEnv["config"], fields: BotEnv["fields"], now: Date): Promise<BotEnv> {
    const [deal, client, workTime, nextWorkStart, catalog, site] = await Promise.all([
      this.d.crm.deal(conv.dealId!),
      conv.clientId ? this.d.crm.client(conv.clientId) : null,
      this.d.settings.isWorkTime(now),
      this.d.settings.nextWorkStart(now),
      this.d.settings.catalog(),
      this.d.settings.site(),
    ]);
    const locale: BotLang | null = client?.locale === "kk" ? "kk" : null;
    // Оплата — из CRM: ручные платежи и онлайн-оплаты счетов (у пакета — по всему пакету), счета из чата, заказы.
    const payments = deal && this.d.crm.payments ? await this.d.crm.payments({ id: conv.dealId!, clientId: conv.clientId ?? deal.clientId, orderId: deal.orderId }).catch((err) => (this.d.logger.warn("bot payments", { error: String(err) }), null)) : null;
    return {
      config,
      fields,
      dealValues: deal?.customFields ?? {},
      now,
      tz: this.d.settings.timeZone(),
      workTime,
      nextWorkStart,
      catalog,
      site,
      client: { known: !!conv.clientId, locale },
      name: safeName(conv.contactName, client?.name),
      // Оплата уже вносилась (деньги по сделке или оплаченный заказ): предоплату бот не предлагает.
      paid: payments ? factsPaid(payments) : (deal?.paid ?? 0) > 0 || !!deal?.orderId,
      payments,
    };
  }

  /** AI с таймаутом: только поля и намерения, тексты клиенту остаются из настроек. */
  private async understand(state: BotState, inputs: BotInput[], env: BotEnv) {
    const messages = inputs.filter((i) => !state.seen.includes(i.id) && i.text.trim()).map((i) => ({ from: "client" as const, text: i.text.slice(0, 1000) }));
    if (!messages.length || !this.d.brain) return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), BOT_AI_TIMEOUT_MS);
    });
    try {
      return await Promise.race([this.d.brain.understand({ messages, fields: env.fields.filter((f) => state.questions.includes(f.key)), asking: state.asking, today: env.now.toISOString().slice(0, 10) }), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Последствия хода: поля сделки, тема, ответ клиенту, журнал, итог менеджеру. */
  private async apply(conv: Conversation, before: BotState, turn: BotTurn, fields: BotEnv["fields"], env: BotEnv) {
    const dealId = conv.dealId!;
    for (const [key, value] of Object.entries(turn.fields)) await this.d.sales.setField(dealId, key, value);
    if (turn.state.theme && turn.state.theme !== before.theme) await this.d.crm.tag(dealId, `тема: ${themeLabel(turn.state.theme, "ru")}`).catch((err) => this.d.logger.error("bot tag", err));
    const events: BotEvent[] = [...turn.events];
    // Клиент согласен: сначала счёт от бота; вышел — текст «менеджер пришлёт счёт» не нужен.
    const invoiced = turn.done && turn.state.reason === "agreed" ? await this.invoice(conv, turn.state, env) : null;
    if (turn.reply && !invoiced) {
      // Номер, карта или реквизиты в тексте из настроек — не отправляем (защита от «левака» действует и для бота).
      const found = findSensitive(turn.reply, [conv.chatId, conv.meta.phone, await this.d.shopPhone()]);
      const latest = await this.d.store.load(conv.id);
      if (found.length) {
        this.d.logger.error("bot reply blocked", found.map((f) => f.kind).join(","));
        events.push({ kind: "blocked", reason: `blocked:${found.map((f) => f.kind).join(",")}` });
      } else if (latest?.state?.outcome !== "stopped_by_manager") {
        // Человек ответил, пока бот думал, — бот молчит.
        await this.d.send(conv.id, turn.reply);
      }
    }
    await this.d.store.log(conv.id, dealId, turn.state.lang, events);
    if (turn.state.stage === "offer" && before.stage !== "offer") await this.offered(conv, turn.state, fields);
    if (turn.done) await this.finish(conv, invoiced ?? turn.state, fields);
  }

  /** Бот сделал предложение: менеджер видит горячего клиента сразу (заметка и уведомление), бот продолжает диалог. */
  private async offered(conv: Conversation, state: BotState, fields: BotEnv["fields"]) {
    const deal = await this.d.sales.deal(conv.dealId!);
    if (!deal) return;
    const summary = botSummary(state, fields, deal.customFields);
    await this.d.sales.note(deal, summary);
    await this.d.note(conv.id, summary).catch((err) => this.d.logger.error("bot note", err));
    const who = deal.contactName || conv.contactName || phoneTail(conv.chatId) || "клиент";
    await this.d.notifier.notify(deal.assigneeId, "chats.view", { kind: "message", title: `Бот сделал предложение: ${who}`, body: summary.split("\n").slice(1).join(" · ").slice(0, 300), link: `/admin/chats?c=${conv.id}` });
  }

  /**
   * Клиент согласен: в режиме «Продаёт» со счётом бот выпускает счёт сам (цена — тариф из «Цен и тарифов», сумма —
   * предоплата) и отправляет его. Не вышло — уже отправлен текст «менеджер пришлёт счёт», задачу поставит finish.
   */
  private async invoice(conv: Conversation, state: BotState, env: BotEnv): Promise<BotState | null> {
    const sell = env.config.sell;
    if (!sell.on || !sell.invoice || !this.d.invoices) return null;
    const plan = sellPlan(state, env);
    const priced = sellerInvoice(plan, env);
    if (!priced) return null;
    const { total, amount } = priced;
    // Человек ответил, пока бот думал, — счёт не выставляем.
    if ((await this.d.store.load(conv.id))?.state?.version !== state.version) return null;
    const deal = await this.d.sales.deal(conv.dealId!);
    const result = await this.d.invoices
      .issue({ conversationId: conv.id, dealId: conv.dealId!, plan, agreedTotal: total, amount, locale: state.lang, clientName: env.name || deal?.contactName || "", key: `bot:${conv.id}:${state.version}` })
      .catch((err) => ({ error: String(err) }));
    if ("error" in result) {
      this.d.logger.warn("bot invoice", { error: result.error });
      await this.d.store.log(conv.id, conv.dealId, state.lang, [{ kind: "blocked", reason: `invoice: ${result.error}`.slice(0, 200) }]);
      return null;
    }
    // Ход уже записан завершённым (botStep -1) — поверх него, но по версии: ответ человека в эту секунду не затирается.
    const next: BotState = { ...state, outcome: "invoiced", reason: result.label, version: state.version + 1 };
    if (!(await this.d.store.save(conv.id, state.version, { botStep: BOT_DONE, state: next, dueAt: null }, { restart: true }))) return null;
    await this.d.send(conv.id, botSellText(state, env, "invoiceSent"));
    await this.d.send(conv.id, result.text);
    await this.d.store.log(conv.id, conv.dealId, state.lang, [{ kind: "invoiced", reason: result.label }]);
    return next;
  }

  /**
   * Клиент молчит. Шаблонный бот после предложения — одно напоминание через N часов. AI-продажник — как менеджер
   * (followUpDelayMs): тёплому клиенту через 20 минут «Ознакомились?», через N часов «Освободились?», на следующий день
   * «Как ваши дела?»; остальным — через N часов и на следующий день (всё в рабочее время). Если холодный клиент замолчал
   * ещё на знакомстве — через полчаса менеджер узнаёт об этом (может ответить сам — бот замолчит). Дальше 12 часов
   * тишины — итог менеджеру. Клиенту из стоп-листа «Не писать первым» бот не напоминает — только итог.
   */
  private async offerIdle(conv: Conversation, state: BotState, config: BotEnv["config"], fields: BotEnv["fields"], now: Date, inputs: BotInput[]): Promise<boolean> {
    const last = new Date(state.lastBotAt ?? state.offeredAt ?? state.since).getTime();
    const ai = readSellerAi(state.ai);
    const aiEngine = state.engine === "ai";
    // Договорились написать в названный день (или в последний день старта): лестница напоминаний не нужна — пишем в срок.
    if (aiEngine && ai.remind) return this.remindTouch(conv, state, config, fields, now, ai.remind, inputs);
    // AI-продажник: тёплому клиенту — чаще (20 минут, несколько часов, следующий день), остальным — как раньше.
    let wait = aiEngine
      ? ai.followUps < SELLER_MAX_FOLLOW_UPS
        ? followUpDelayMs(ai, config.sell.followUpHours, BOT_NEXT_DAY_FOLLOW_UP_MS)
        : null
      : config.sell.followUpHours > 0 && !state.followedUp
        ? config.sell.followUpHours * 3_600_000
        : null;
    // Клиент просил не писать первым — напоминаний нет: после 12 часов тишины только итог менеджеру.
    if (wait !== null && (await this.noMarketing(conv))) wait = null;
    if (wait !== null) {
      const at = new Date(last + wait);
      // Ночью не пишем: напоминание — с началом рабочего дня.
      const due = (await this.d.settings.isWorkTime(at)) ? at : ((await this.d.settings.nextWorkStart(at)) ?? at);
      // Тёплому клиенту бот сам напомнит через 20 минут — заметку «клиент замолчал» менеджеру не шлём.
      if (aiEngine && state.stage !== "offer" && !ai.silenceNoted && ai.followUps === 0 && !isWarmLead(ai)) {
        const noteAt = last + BOT_ABANDON_MS;
        if (now.getTime() < noteAt) {
          await this.later(conv.id, new Date(Math.min(noteAt, due.getTime())));
          return false;
        }
        return this.silenceNote(conv, state, due);
      }
      if (now.getTime() < due.getTime()) {
        await this.later(conv.id, due);
        return false;
      }
      if (aiEngine) return this.#seller.followUp(conv, state, config, fields, now);
      const env = await this.env(conv, config, fields, now);
      const turn = botFollowUp(state, env);
      if (!(await this.d.store.save(conv.id, state.version, { botStep: 0, state: turn.state, dueAt: new Date(now.getTime() + BOT_OFFER_IDLE_MS) }))) return true;
      await this.apply(conv, state, turn, fields, env);
      return false;
    }
    if (now.getTime() - last < BOT_OFFER_IDLE_MS) {
      await this.d.store.setDue(conv.id, new Date(last + BOT_OFFER_IDLE_MS));
      return false;
    }
    // Тёплый клиент с датой так и не оформил — вместо итога одно сообщение в последний день, когда ещё можно успеть.
    if (aiEngine) {
      const planned = await this.planLastStart(conv, state, config, fields, now);
      if (planned !== null) return planned;
    }
    // Итог: после предложения — «клиент молчит после предложения», на знакомстве — «не ответил боту».
    const { state: next, events } = state.stage === "offer" ? offerExpired(state) : abandonBot(state);
    if (!(await this.d.store.save(conv.id, state.version, { botStep: BOT_DONE, state: next, dueAt: null }))) return true;
    await this.d.store.log(conv.id, conv.dealId, next.lang, events);
    await this.finish(conv, next, fields);
    return false;
  }

  /**
   * Срок повторного сообщения (bots-5). На момент отправки ещё раз: правило не выключили, лимит за беседу, клиент не писал
   * после договорённости (разговор продолжился — «как и договаривались» некстати), сделка не закрыта, у клиента нет заказа
   * (и по другой сделке), чат не закрыт, клиент не просил не писать первым, дата события не прошла, сейчас рабочее время.
   * Нельзя — договорённость снимается, дальше как обычно (12 часов тишины — итог менеджеру); в журнал — почему.
   */
  private async remindTouch(conv: Conversation, state: BotState, config: BotEnv["config"], fields: BotEnv["fields"], now: Date, remind: SellerRemind, inputs: BotInput[]): Promise<boolean> {
    const due = new Date(remind.at);
    if (now.getTime() < due.getTime()) {
      await this.later(conv.id, due);
      return false;
    }
    const ai = readSellerAi(state.ai);
    const sell = config.sell;
    const tz = this.d.settings.timeZone();
    const deal = await this.d.crm.deal(conv.dealId!);
    const eventDate = sellerEventDate(state, { fields, dealValues: deal?.customFields ?? {} });
    const today = zonedDay(now, tz);
    // Клиент писал после договорённости, а ход её не подтвердил (голосовое без распознавания и т. п.) — разговор продолжился.
    const wrote = inputs.some((i) => new Date(i.at).getTime() > Date.parse(remind.setAt));
    let skip: string | null = !(remind.kind === "promised" ? sell.remind : sell.lastStart) ? "off" : ai.touches >= sell.remindTouches ? "limit" : wrote ? "client_wrote" : eventDate && today > eventDate ? "after_event" : null;
    skip ??= await this.remindBlocker(conv, deal);
    if (!skip && (await this.noMarketing(conv))) skip = "no_marketing";
    if (!skip && !(await this.d.settings.isWorkTime(now))) {
      // Проход опоздал за конец смены: пишем с началом следующей, если она не позже даты события.
      const next = await this.d.settings.nextWorkStart(now);
      if (next && (!eventDate || zonedDay(next, tz) <= eventDate)) {
        await this.later(conv.id, next);
        return false;
      }
      skip = "off_hours";
    }
    if (skip) {
      // Лестница напоминаний не возобновляется: «Ознакомились?» спустя дни после разговора было бы странно.
      const next: BotState = { ...state, ai: { ...ai, remind: null, followUps: SELLER_MAX_FOLLOW_UPS }, version: state.version + 1 };
      if (!(await this.d.store.save(conv.id, state.version, { botStep: 0, state: next, dueAt: now }))) return true;
      await this.d.store.log(conv.id, conv.dealId, state.lang, [{ kind: "blocked", reason: `remind: ${skip}` }]);
      return false;
    }
    return this.#seller.followUp(conv, state, config, fields, now, remind);
  }

  /**
   * Клиент замолчал насовсем (напоминания кончились, 12 часов тишины), но он тёплый, не платил и назвал дату: вместо
   * итога — одно сообщение в последний день старта (lastStartDay), если он ещё впереди, в рабочее время и в пределах
   * remindMaxDays. Последний день нерабочий — ближайший рабочий день до него. null — не нужно, итог как раньше.
   */
  private async planLastStart(conv: Conversation, state: BotState, config: BotEnv["config"], fields: BotEnv["fields"], now: Date): Promise<boolean | null> {
    const ai = readSellerAi(state.ai);
    const sell = config.sell;
    if (!sell.lastStart || ai.touches >= sell.remindTouches || !isWarmLead(ai)) return null;
    // Сделку закрыли (менеджер дозвонился), у клиента заказ (и по другой сделке), чат закрыт — продавать уже нечего.
    if (await this.remindBlocker(conv, await this.d.crm.deal(conv.dealId!))) return null;
    const env = await this.env(conv, config, fields, now);
    const eventDate = sellerEventDate(state, env);
    if (!eventDate || env.paid) return null;
    const today = zonedDay(now, env.tz);
    const lastDay = lastStartFor(eventDate, env, ai.city);
    if (!lastDay || lastDay <= today || (Date.parse(`${lastDay}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000 > sell.remindMaxDays) return null;
    if (await this.noMarketing(conv)) return null;
    let due: Date | null = null;
    for (let back = 0; back < 7 && !due; back++) {
      const day = new Date(Date.parse(`${lastDay}T00:00:00Z`) - back * 86_400_000).toISOString().slice(0, 10);
      if (day <= today) break;
      due = await workStartOn(this.d.settings, day, env.tz);
    }
    if (!due) return null;
    const remind: SellerRemind = { kind: "last_start", at: due.toISOString(), why: eventDate, setAt: now.toISOString() };
    const next: BotState = { ...state, ai: { ...ai, remind }, version: state.version + 1 };
    if (!(await this.d.store.save(conv.id, state.version, { botStep: 0, state: next, dueAt: due }))) return true;
    await this.#seller.remindNote(conv, remind, ai.summary);
    return false;
  }

  /**
   * Писать клиенту повторно (по договорённости или в последний день) уже не о чем: чат закрыт, сделки нет или она закрыта,
   * по ней заказ или у клиента уже есть заказы — как при подхвате (takeoverBlocker). Пока бот ждёт назначенного дня,
   * сделку могли закрыть по звонку, а клиент — оформить заказ по другой сделке. null — писать можно.
   */
  private async remindBlocker(conv: Conversation, deal: Awaited<ReturnType<BotCrm["deal"]>>): Promise<string | null> {
    if (conv.status === "closed") return "chat_closed";
    const clientId = conv.clientId ?? deal?.clientId ?? null;
    const client = clientId ? await this.d.crm.client(clientId) : null;
    return this.takeoverBlocker(deal, client);
  }

  /** В стоп-листе «Не писать первым» (или спам); сбой проверки — не пишем: лишнее напоминание хуже пропущенного. */
  private async noMarketing(conv: Conversation) {
    if (!this.d.noMarketing) return false;
    return this.d.noMarketing(conv).catch((err) => (this.d.logger.error("bot no marketing", err), true));
  }

  /** Клиент замолчал на знакомстве: менеджеру заметка и уведомление (что известно и когда бот напомнит), бот ждёт дальше. */
  private async silenceNote(conv: Conversation, state: BotState, due: Date): Promise<boolean> {
    const next: BotState = { ...state, ai: { ...readSellerAi(state.ai), silenceNoted: true }, version: state.version + 1 };
    if (!(await this.d.store.save(conv.id, state.version, { botStep: 0, state: next, dueAt: due }))) return true;
    this.d.timers.schedule(conv.id, due, () => void this.process(conv.id));
    const when = new Intl.DateTimeFormat("ru-RU", { timeZone: this.d.settings.timeZone(), day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(due);
    const summary = readSellerAi(state.ai).summary;
    const text = `🤖 Клиент замолчал на знакомстве с ботом. Бот напомнит о себе ${when}. Ответьте сами — бот замолчит.${summary ? `\nЗаметка бота: ${summary}` : ""}`;
    await this.d.note(conv.id, text).catch((err) => this.d.logger.error("bot note", err));
    const deal = await this.d.sales.deal(conv.dealId!);
    const who = deal?.contactName || conv.contactName || phoneTail(conv.chatId) || "клиент";
    await this.d.notifier.notify(deal?.assigneeId ?? conv.assigneeId, "chats.view", { kind: "message", title: `Клиент замолчал: ${who}`, body: `Бот напомнит ${when}.${summary ? ` ${summary}` : ""}`.slice(0, 300), link: `/admin/chats?c=${conv.id}` });
    return false;
  }

  /** Итог менеджеру: заметка в сделке и в чате, задача, если клиент просит человека, одно уведомление. */
  private async finish(conv: Conversation, state: BotState, fields: BotEnv["fields"]) {
    const deal = await this.d.sales.deal(conv.dealId!);
    if (!deal) return;
    const summary = botSummary(state, fields, deal.customFields);
    await this.d.sales.note(deal, summary);
    await this.d.note(conv.id, summary).catch((err) => this.d.logger.error("bot note", err));
    const who = deal.contactName || conv.contactName || phoneTail(conv.chatId) || "клиент";
    if (state.outcome === "handoff") {
      const now = this.d.clock.now();
      const start = (await this.d.settings.isWorkTime(now)) ? now : ((await this.d.settings.nextWorkStart(now)) ?? now);
      const call = state.reason === "call";
      const verb = state.reason === "agreed" ? "Выставить счёт" : state.reason === "price" ? "Назвать цену" : call ? "Перезвонить" : "Ответить";
      // Ответственного нет (ночь, круг ещё не раздал) — задачу видят все, утром её заберёт круг вместе со сделкой.
      // «Ответить» и «Назвать цену» закрывает ответ клиенту в чате; «Выставить счёт» — нет (ответить ещё не значит
      // выставить), поэтому это обычная задача, а не «сообщение».
      await this.d.tasks.create({
        title: `${verb}: ${who} — ${outcomeTitle(state).replace(/^Клиент /, "").toLowerCase()} (бот)`.slice(0, 200),
        kind: call ? "call" : state.reason === "agreed" ? "task" : "message",
        dueAt: new Date(start.getTime() + (state.reason === "agreed" || state.reason === "price" ? 5 : 15) * 60_000),
        dealId: deal.id,
        clientId: deal.clientId,
        assigneeId: deal.assigneeId,
      });
    }
    await this.d.notifier.notify(deal.assigneeId, "chats.view", {
      kind: state.outcome === "handoff" ? "task" : "message",
      title: `${outcomeTitle(state)}: ${who}`,
      body: summary.split("\n").slice(1).join(" · ").slice(0, 300),
      link: `/admin/chats?c=${conv.id}`,
    });
  }
}
