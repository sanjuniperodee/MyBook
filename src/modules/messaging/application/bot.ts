import type { Clock, Logger } from "@/shared/application";
import { phoneTail } from "@/shared/domain/phone";
import {
  BOT_DONE,
  abandonBot,
  channelLabel,
  preview,
  botChannelOf,
  botSummary,
  botTurn,
  findSensitive,
  newBotState,
  outcomeTitle,
  safeName,
  startBlocker,
  themeLabel,
  type BotEnv,
  type BotEvent,
  type BotInput,
  type BotLang,
  type BotSkipReason,
  type BotState,
  type BotTurn,
  type Conversation,
  type InboundMessage,
} from "../domain";
import type { BotBrain, BotCrm, BotSettings, BotStore, BotTimers, ConversationRepository, SalesGateway, StaffNotifier, Tasks } from "./ports";

/** Пауза после сообщения клиента: на серию «Здравствуйте / хочу узнать цену / для мамы» бот отвечает одним сообщением. */
export const BOT_PAUSE_MS = 7_000;
/** Клиент молчит посреди опроса столько — частичная сводка менеджеру, бот больше не пишет. */
export const BOT_ABANDON_MS = 30 * 60_000;
/** AI думает не дольше — иначе только детерминированный разбор. */
export const BOT_AI_TIMEOUT_MS = 6_000;

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
  /** Отправить клиенту от имени бота. */
  send(conversationId: string, text: string): Promise<unknown>;
  /** Внутренняя заметка в чате (итог бота) — клиент её не видит. */
  note(conversationId: string, text: string): Promise<unknown>;
  /** Номер магазина: его бот писать может, остальные номера, карты и реквизиты — нет. */
  shopPhone(): Promise<string>;
  brain?: BotBrain | null;
}

/**
 * Бот-квалификатор: на новое обращение здоровается, отвечает на частые вопросы, спрашивает недостающее из вопросов
 * настроек и записывает ответы в поля сделки. Молчит, как только ответил человек (из CRM или с телефона), и не
 * начинает, если это не новый клиент (заказ, книга, сделка в работе, переписка до CRM) или канал выключен. Отвечает
 * после паузы в сообщениях клиента — одним сообщением. Режим: off | always | off_hours | fallback (если менеджер не
 * ответил за N минут; вне рабочего времени — сразу).
 */
export class QualifierBot {
  readonly #running = new Set<string>();

  constructor(private readonly d: QualifierBotDeps) {}

  /**
   * Входящее сообщение (инбокс вызывает после записи сообщения). quiet — бот ведёт диалог: уведомление на каждое
   * сообщение клиента не нужно, менеджер получит итог.
   */
  async onIncoming(conv: Conversation, m: InboundMessage, opts: { created: boolean; dealCreated: boolean }): Promise<{ quiet: boolean }> {
    if (conv.botStep === BOT_DONE || !conv.dealId) return { quiet: false };
    const mode = await this.d.settings.mode();
    if (mode === "off") return { quiet: false };
    const now = this.d.clock.now();
    const rec = await this.d.store.load(conv.id);
    const state = rec?.state ?? null;
    if (state?.phase === "active") {
      await this.later(conv.id, new Date(now.getTime() + BOT_PAUSE_MS));
      return { quiet: true };
    }
    if (state?.phase === "waiting") {
      // Пауза сдвигается с каждым сообщением; срок ожидания менеджера (fallback) — нет. Пока бот ждёт только паузу,
      // о первом сообщении менеджер уже знает — серия «Здравствуйте / хочу узнать цену» не даёт уведомления на каждое;
      // пока бот ждёт ответа человека (fallback), уведомления идут как обычно.
      await this.later(conv.id, new Date(Math.max(rec?.dueAt?.getTime() ?? 0, now.getTime() + BOT_PAUSE_MS)));
      return { quiet: !state.waitHuman };
    }
    if (state) return { quiet: false };
    // Диалог, начатый прежней версией бота (без состояния), не продолжаем: вопросы могли уйти поверх человека.
    if (conv.botStep !== null) {
      await this.d.conversations.advanceBot(conv.id, conv.botStep, BOT_DONE);
      return { quiet: false };
    }
    if (!opts.created) return { quiet: false };

    const [config, fields, workTime] = await Promise.all([this.d.settings.config(), this.d.settings.dealFields(), this.d.settings.isWorkTime(now)]);
    const channel = botChannelOf(conv.channel);
    const questions = config.questions.filter((q) => fields.some((f) => f.key === q.field)).length;
    const fresh = newBotState(new Date(m.at.getTime() - 1000), opts.dealCreated);
    let reason: BotSkipReason | null = !channel || !config.channels.includes(channel) ? "channel" : !questions ? "no_questions" : mode === "off_hours" && workTime ? "work_time" : null;
    if (!reason) {
      // Клиент с заказом, книгой или сделкой в работе — без опроса (первые сообщения проверяются перед стартом).
      const [deal, client] = await Promise.all([this.d.crm.deal(conv.dealId), conv.clientId ? this.d.crm.client(conv.clientId) : null]);
      reason = startBlocker({ channelOk: true, questions, deal: deal && { ...deal, assigned: !!deal.assigneeId }, fresh: opts.dealCreated, client, priorChat: false, inputs: [] });
      if (reason === "media_only") reason = null;
    }
    if (reason) {
      await this.skip(conv, fresh, null, reason);
      return { quiet: false };
    }
    fresh.waitHuman = mode === "fallback" && workTime;
    const due = new Date(now.getTime() + (fresh.waitHuman ? config.waitMinutes * 60_000 : BOT_PAUSE_MS));
    if (await this.d.store.save(conv.id, null, { botStep: null, state: fresh, dueAt: due })) this.d.timers.schedule(conv.id, due, () => void this.process(conv.id));
    return { quiet: false };
  }

  /** Бот ведёт диалог или собирается (правило-автоответ в такой диалог не пишет — иначе клиенту два ответа). */
  async isActive(conversationId: string) {
    const rec = await this.d.store.load(conversationId);
    return !!rec?.state && rec.state.phase !== "done" && rec.botStep !== BOT_DONE;
  }

  /** Человек ответил клиенту (с телефона или из CRM) или нажал «Остановить бота»: бот больше не пишет. */
  async stopByHuman(conversationId: string, reason = "reply") {
    const stopped = await this.d.store.stop(conversationId, reason);
    if (stopped) await this.d.store.log(conversationId, null, null, [{ kind: "stopped_by_manager", reason }]).catch((err) => this.d.logger.error("bot log", err));
    return stopped;
  }

  /** Запустить бота вручную (кнопка в чате): поздоровается и спросит недостающее. */
  async startManually(conversationId: string) {
    const conv = await this.d.conversations.findById(conversationId);
    if (!conv?.dealId) throw new Error("Сначала привяжите диалог к сделке");
    const rec = await this.d.store.load(conversationId);
    if (rec?.state && rec.state.phase !== "done" && rec.botStep !== BOT_DONE) throw new Error("Бот уже ведёт этот диалог");
    const now = this.d.clock.now();
    const prev = rec?.state?.version ?? null;
    const state: BotState = { ...newBotState(now, false), reason: "manual", version: (prev ?? -1) + 1 };
    if (!(await this.d.store.save(conversationId, prev, { botStep: null, state, dueAt: now }, { restart: true }))) throw new Error("Диалог только что изменился — попробуйте ещё раз");
    await this.process(conversationId);
  }

  /** Фоновый проход (раз в минуту): отложенные ходы, ожидание менеджера, брошенные опросы. */
  async sweep(limit = 50) {
    const ids = await this.d.store.due(this.d.clock.now(), limit);
    for (const id of ids) await this.process(id);
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
    if (!rec || !state || state.phase === "done" || rec.botStep === BOT_DONE) return false;
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

    if (state.phase === "waiting" && state.reason !== "manual") {
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
    await this.apply(conv, state, turn, fields);
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
    const reason = startBlocker({
      channelOk: !!channel && config.channels.includes(channel),
      questions: config.questions.filter((q) => fields.some((f) => f.key === q.field)).length,
      deal: deal && { ...deal, assigned: !!deal.assigneeId },
      fresh: state.fresh,
      client,
      priorChat: false,
      inputs,
    });
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
  private async apply(conv: Conversation, before: BotState, turn: BotTurn, fields: BotEnv["fields"]) {
    const dealId = conv.dealId!;
    for (const [key, value] of Object.entries(turn.fields)) await this.d.sales.setField(dealId, key, value);
    if (turn.state.theme && turn.state.theme !== before.theme) await this.d.crm.tag(dealId, `тема: ${themeLabel(turn.state.theme, "ru")}`).catch((err) => this.d.logger.error("bot tag", err));
    const events: BotEvent[] = [...turn.events];
    if (turn.reply) {
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
    if (turn.done) await this.finish(conv, turn.state, fields);
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
      // Ответственного нет (ночь, круг ещё не раздал) — задачу видят все, утром её заберёт круг вместе со сделкой.
      await this.d.tasks.create({
        title: `${call ? "Перезвонить" : "Ответить"}: ${who} — ${outcomeTitle(state).replace(/^Клиент /, "").toLowerCase()} (бот)`.slice(0, 200),
        kind: call ? "call" : "message",
        dueAt: new Date(start.getTime() + 15 * 60_000),
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
