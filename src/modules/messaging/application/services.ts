import type { Clock, Logger } from "@/shared/application";
import { formatPhone, normalizePhone } from "@/shared/domain/phone";
import {
  BOT_DONE,
  answerValue,
  botFinish,
  botGreeting,
  botQuestion,
  botSummary,
  channelLabel,
  contactChanges,
  contactEmail,
  contactPhone,
  contactTitle,
  preview,
  shouldApplyStatus,
  type Conversation,
  type ConversationMeta,
  type DeliveryStatus,
  type InboundMessage,
} from "../domain";
import type { Blocklist, BotSettings, ChannelTransport, ConversationRepository, IncomingRules, LinkAttribution, LiveUpdates, MessageRepository, SalesGateway, StaffNotifier, Tasks } from "./ports";

/** Дополнительно для каналов без Wazzup: клиент с сайта (вошёл в аккаунт) и служебные данные канала. */
export interface IngestExtra {
  clientId?: string | null;
  meta?: ConversationMeta;
  subject?: string | null;
}

/**
 * Бот-квалификатор: на новое обращение задаёт вопросы из настроек и записывает ответы в поля сделки.
 * Останавливается, как только отвечает менеджер. Режим: off | always | off_hours.
 */
export class QualifierBot {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly settings: BotSettings,
    private readonly sales: SalesGateway,
    private readonly notifier: StaffNotifier,
    private readonly clock: Clock,
  ) {}

  async onIncoming(conv: Conversation, text: string, isNew: boolean, send: (text: string) => Promise<unknown>) {
    const mode = await this.settings.mode();
    if (mode !== "always" && mode !== "off_hours") return;
    if (conv.botStep === BOT_DONE || !conv.dealId) return;
    const config = await this.settings.config();
    if (!config.questions.length) return;
    const fields = await this.settings.dealFields();

    // Шаг ещё не начат: запускаем только на первое обращение (новый диалог).
    if (conv.botStep === null) {
      if (!isNew) return;
      if (mode === "off_hours" && (await this.settings.isWorkTime(this.clock.now()))) return;
      if (!(await this.conversations.advanceBot(conv.id, null, 0))) return;
      await send([botGreeting(config, conv.contactName), botQuestion(config, 0, fields)].filter(Boolean).join("\n\n"));
      return;
    }

    // Ответ на текущий вопрос → поле сделки → следующий вопрос или завершение.
    const step = conv.botStep;
    const q = config.questions[step];
    if (!q) return;
    const field = fields.find((x) => x.key === q.field);
    const value = answerValue(text, field);
    if (field && value !== null) await this.sales.setField(conv.dealId, field.key, value);
    const next = step + 1;
    const done = next >= config.questions.length;
    if (!(await this.conversations.advanceBot(conv.id, step, done ? BOT_DONE : next))) return;
    if (!done) {
      await send(botQuestion(config, next, fields) ?? "");
      return;
    }
    if (config.finish.trim()) await send(botFinish(config, conv.contactName));
    const deal = await this.sales.deal(conv.dealId);
    if (!deal) return;
    const summary = botSummary(config, fields, deal.customFields);
    await this.sales.note(deal, `Бот собрал ответы клиента:\n${summary}`);
    await this.notifier.notify(deal.assigneeId, "chats.view", { kind: "message", title: `Бот собрал ответы: ${deal.contactName || deal.title}`, body: summary.replace(/\n/g, " · "), link: `/admin/chats?c=${conv.id}` });
  }
}

/** Единый инбокс: входящие из всех каналов, отправка ответов, статусы доставки. */
export class MessagingService {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly blocklist: Blocklist,
    private readonly transport: ChannelTransport,
    private readonly sales: SalesGateway,
    private readonly links: LinkAttribution,
    private readonly notifier: StaffNotifier,
    private readonly live: LiveUpdates,
    private readonly rules: IncomingRules,
    private readonly bot: QualifierBot,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  /** Диалог по собеседнику; новый сразу связываем с клиентом по телефону. */
  private async upsert(m: InboundMessage, extra: IngestExtra): Promise<{ conv: Conversation; created: boolean }> {
    const existing = await this.conversations.findByChat(m.chatType, m.channelId, m.chatId);
    if (existing) {
      const patch = contactChanges(existing, m, extra);
      return { conv: patch ? await this.conversations.updateContact(existing.id, patch) : existing, created: false };
    }
    const meta = extra.meta ?? {};
    const phone = contactPhone({ chatId: m.chatId, meta });
    const clientId = extra.clientId ?? (phone ? await this.sales.findClientByPhone(phone) : null);
    const conv = await this.conversations.create({ channel: m.chatType, channelId: m.channelId, chatId: m.chatId, contactName: m.isEcho ? "" : m.contactName, avatarUrl: m.avatarUrl, clientId, meta });
    if (conv) return { conv, created: true };
    return { conv: (await this.conversations.findByChat(m.chatType, m.channelId, m.chatId))!, created: false };
  }

  /** Сделка для диалога: открытая по клиенту/телефону или новая заявка (с нового номера — в «Неразобранное»). */
  private async ensureDeal(conv: Conversation, contactName: string, firstText: string): Promise<Conversation> {
    if (conv.dealId) return conv;
    const phone = contactPhone(conv);
    // Код рекламной ссылки в первом сообщении («… (код: insta-bio)») — откуда пришёл клиент.
    const utm = await this.links.fromText(firstText);
    const existing = await this.sales.findOpenDeal({ clientId: conv.clientId, phone });
    if (existing && utm && !existing.utm) await this.sales.setUtmIfEmpty(existing.id, utm);
    const deal =
      existing ??
      (await this.sales.createDeal({
        title: `Заявка из ${channelLabel(conv.channel)}${contactName ? `: ${contactName}` : phone ? `: ${formatPhone(phone)}` : ""}`,
        channel: conv.channel,
        clientId: conv.clientId,
        contactName: contactTitle(conv, contactName, formatPhone),
        contactPhone: phone,
        contactEmail: contactEmail(conv),
        unsorted: true,
        utm,
      }));
    return this.conversations.linkDeal(conv.id, { dealId: deal.id, clientId: conv.clientId ?? deal.clientId, assigneeId: conv.assigneeId ?? deal.assigneeId });
  }

  async ingest(m: InboundMessage, extra: IngestExtra = {}) {
    const { conv: base, created } = await this.upsert(m, extra);
    if (m.isEcho) {
      // Эхо нашего же сообщения из CRM: внешний ID уже записан при отправке (или запишется) — не дублируем.
      if (await this.messages.existsExternal(m.externalId)) return;
      if (await this.messages.claimPendingEcho(base.id, m.text, new Date(this.clock.now().getTime() - 120_000), m.externalId)) return;
      if (!(await this.messages.insertEcho(base.id, m))) return;
      await this.conversations.recordEcho(base.id, preview(m.text), m.at);
      return;
    }
    if (!(await this.messages.insertIncoming(base.id, m, extra.subject ?? null))) return; // повторная доставка вебхука

    // Спам: сообщение сохраняем (на случай ошибки), но без заявки, уведомлений и правил.
    if (await this.blocklist.isBlocked(m.chatId, contactPhone({ chatId: m.chatId, meta: {} }))) {
      await this.conversations.closeAsSpam(base.id, preview(m.text), m.at);
      return;
    }
    const conv = await this.ensureDeal(base, m.contactName, m.text);
    await this.conversations.recordIncoming(conv.id, preview(m.text), m.at);
    await this.notifier.notify(conv.assigneeId, "chats.view", {
      kind: "message",
      title: `${conv.contactName || m.contactName || formatPhone(conv.chatId) || conv.chatId} · ${channelLabel(conv.channel)}`,
      body: preview(m.text),
      link: `/admin/chats?c=${conv.id}`,
    });
    this.live.chatChanged(conv.id);
    const fresh = (await this.conversations.findById(conv.id)) ?? conv;
    await this.bot.onIncoming(fresh, m.text, created, (text) => this.send(conv.id, text, null)).catch((err) => this.logger.error("bot", err));
    await this.rules.messageIncoming({ subject: `${conv.id}:${m.at.toISOString().slice(0, 10)}`, conversationId: conv.id, dealId: conv.dealId, clientId: conv.clientId, channel: conv.channel });
  }

  async applyStatus(s: DeliveryStatus) {
    const msg = await this.messages.byExternalId(s.externalId);
    if (!msg || !shouldApplyStatus(msg.status, s.status)) return;
    await this.messages.setStatus(msg.id, s.status, s.error);
    this.live.chatChanged(msg.conversationId);
  }

  /** Отправка из CRM: менеджером или правилом/ботом (authorId = null). */
  async send(conversationId: string, text: string, authorId: string | null) {
    const conv = await this.conversations.findById(conversationId);
    if (!conv) throw new Error("Диалог не найден");
    const body = text.trim().slice(0, 4000);
    if (!body) throw new Error("Пустое сообщение");
    const msg = await this.messages.insertOutgoing(conversationId, body, authorId);
    await this.conversations.recordOutgoing(conversationId, preview(body), this.clock.now(), authorId);
    if (authorId && conv.dealId) await this.sales.acceptUnsorted(conv.dealId, authorId);
    this.live.chatChanged(conversationId);
    const r = await this.transport.send(conv, msg.id, body);
    if (!r.ok) {
      await this.messages.setStatus(msg.id, "error", r.error);
      this.live.chatChanged(conversationId);
      return { ...msg, status: "error" as const, error: r.error };
    }
    await this.messages.attachExternalId(msg.id, r.externalId);
    if (conv.channel === "email") this.live.chatChanged(conversationId);
    return { ...msg, externalId: r.externalId, status: "sent" as const };
  }

  /** Внутренняя заметка: видна только сотрудникам, клиенту не уходит и не сбрасывает «ждёт ответа». */
  async addInternalNote(conversationId: string, text: string, authorId: string) {
    const body = text.trim().slice(0, 4000);
    if (!body) throw new Error("Пустая заметка");
    return this.messages.insertOutgoing(conversationId, body, authorId, true);
  }

  markRead(conversationId: string) {
    return this.conversations.markRead(conversationId);
  }

  isBlocked(...values: (string | null | undefined)[]) {
    return this.blocklist.isBlocked(...values);
  }

  assign(conversationId: string, userId: string | null) {
    return this.conversations.setAssignee(conversationId, userId);
  }

  /** Закрыть диалог (вопрос решён) — он вернётся сам при новом сообщении клиента. */
  setStatus(conversationId: string, status: "open" | "closed") {
    return this.conversations.setStatus(conversationId, status);
  }

  /** Сделку из чата создали вручную: диалог переходит к её ответственному, если был ничей. */
  async linkCreatedDeal(conversationId: string, deal: { id: string; assigneeId: string | null }) {
    const conv = await this.conversations.findById(conversationId);
    if (conv) await this.conversations.linkDeal(conv.id, { dealId: deal.id, clientId: conv.clientId, assigneeId: conv.assigneeId ?? deal.assigneeId });
  }

  /** Привязать диалог к сделке, если он ещё ни к какой не привязан. */
  async attachDeal(conversationId: string, dealId: string) {
    const conv = await this.conversations.findById(conversationId);
    if (conv && !conv.dealId) await this.conversations.linkDeal(conv.id, { dealId, clientId: conv.clientId, assigneeId: conv.assigneeId });
  }

  /** Заявку приняли — её диалоги переходят к ответственному. */
  assignDealConversations(dealId: string, userId: string) {
    return this.conversations.assignByDeal(dealId, userId);
  }

  /** Заявку отклонили как спам: номер и собеседники больше не создают заявок, диалоги закрыты. */
  async blockDealContacts(dealId: string, phone: string | null, byUserId: string) {
    const values = [...new Set([phone ? normalizePhone(phone) : null, ...(await this.conversations.chatIdsByDeal(dealId))].filter((v): v is string => !!v))];
    if (values.length) await this.blocklist.add(values, byUserId);
    await this.conversations.closeByDeal(dealId);
  }

  /** Снять номер со спама (ошибочно отклонили). */
  unblock(value: string) {
    return this.blocklist.remove(value);
  }

  /** Диалог с клиентом по телефону (кнопка «Написать» в карточке): существующий WhatsApp или новый. */
  async conversationForPhone(phone: string, channelId: string, clientId: string | null, contactName: string) {
    const chatId = normalizePhone(phone);
    if (chatId.length < 10) throw new Error("Некорректный номер телефона");
    const existing = await this.conversations.latestWhatsapp(chatId);
    if (existing) return existing;
    return (await this.conversations.create({ channel: "whatsapp", channelId, chatId, clientId, contactName, avatarUrl: null, meta: {} })) ?? (await this.conversations.findByChat("whatsapp", channelId, chatId))!;
  }
}

/** Виджет на сайте: чат с посетителем и «Перезвоните мне». */
export class SiteChatService {
  constructor(
    private readonly messaging: MessagingService,
    private readonly sales: SalesGateway,
    private readonly tasks: Tasks,
    private readonly notifier: StaffNotifier,
    private readonly live: LiveUpdates,
    private readonly clock: Clock,
    private readonly ids: { uuid(): string; visitorChatId(token: string): string },
  ) {}

  chatIdOf(token: string) {
    return this.ids.visitorChatId(token);
  }

  /** Сообщение посетителя: попадает в инбокс как диалог «Чат на сайте», со сделкой и уведомлением. */
  async post(input: { token: string; text: string; name?: string; phone?: string; page?: string; userId?: string | null; userName?: string }) {
    const phone = input.phone ? normalizePhone(input.phone) : "";
    await this.messaging.ingest(
      { externalId: `site:${this.ids.uuid()}`, channelId: "", chatType: "site", chatId: this.chatIdOf(input.token), at: this.clock.now(), isEcho: false, type: "text", text: input.text, mediaUrl: null, contactName: (input.name || input.userName || "").slice(0, 80), avatarUrl: null, status: null },
      { clientId: input.userId ?? (phone.length >= 10 ? await this.sales.findClientByPhone(phone) : null), meta: { ...(input.page ? { page: input.page.slice(0, 200) } : {}), ...(phone.length >= 10 ? { phone } : {}) } },
    );
  }

  /**
   * «Перезвоните мне»: сделка (открытая по телефону или новая), задача «позвонить» через 15 минут
   * на ответственного и уведомление — чтобы заявка не потерялась.
   */
  async requestCallback(input: { name: string; phone: string; comment?: string; page?: string; userId?: string | null }) {
    const phone = normalizePhone(input.phone);
    const clientId = input.userId ?? (await this.sales.findClientByPhone(phone));
    const who = input.name || formatPhone(phone);
    const deal = (await this.sales.findOpenDeal({ clientId, phone })) ?? (await this.sales.createDeal({ title: `Перезвонить: ${who}`, channel: "site", source: "site", clientId, contactName: input.name, contactPhone: phone, contactEmail: null, unsorted: true, utm: null }));
    const assigneeId = deal.assigneeId ?? (await this.sales.nextRoundRobin());
    const note = [`📞 Заявка на обратный звонок с сайта: ${input.name || "без имени"}, ${formatPhone(phone)}`, input.comment ? `Комментарий: ${input.comment}` : "", input.page ? `Страница: ${input.page}` : ""].filter(Boolean).join("\n");
    await this.sales.note(deal, note);
    await this.tasks.create({ title: `Перезвонить ${who} — заявка с сайта`, kind: "call", dueAt: new Date(this.clock.now().getTime() + 15 * 60_000), dealId: deal.id, clientId: deal.clientId, assigneeId });
    await this.notifier.notify(assigneeId, "deals.view", { kind: "task", title: `Перезвонить: ${who}`, body: input.comment?.slice(0, 160) || "Заявка на обратный звонок с сайта", link: `/admin/deals/${deal.id}` });
    this.live.notificationsChanged();
    return deal.id;
  }
}
