import type { Clock, Logger } from "@/shared/application";
import { normalizePhone, phoneTail } from "@/shared/domain/phone";
import {
  channelLabel,
  contactChanges,
  contactEmail,
  contactPhone,
  contactTitle,
  findSensitive,
  preview,
  redactSecrets,
  sensitiveLabels,
  shouldApplyStatus,
  type Conversation,
  type ConversationMeta,
  type DeliveryStatus,
  type InboundMessage,
} from "../domain";
import type { QualifierBot } from "./bot";
import type { Blocklist, ChannelTransport, ConversationRepository, IncomingRules, LinkAttribution, LiveUpdates, MessageRepository, MessageSource, SalesGateway, StaffNotifier, Tasks } from "./ports";

/** Сообщение канала без секретов в тексте (redactSecrets): так оно и хранится в CRM. */
const withoutSecrets = (m: InboundMessage): InboundMessage => {
  const text = redactSecrets(m.text);
  return text === m.text ? m : { ...m, text };
};

/** Дополнительно для каналов без Wazzup: клиент с сайта (вошёл в аккаунт) и служебные данные канала. */
export interface IngestExtra {
  clientId?: string | null;
  meta?: ConversationMeta;
  subject?: string | null;
  /**
   * WhatsApp через свой шлюз: продолжить прежний диалог с этим номером, даже если он шёл через другой канал (Wazzup) —
   * при переходе с Wazzup история переписки с клиентом не разрывается.
   */
  anyWhatsappChannel?: boolean;
}

/** Бот в инбоксе: входящие, ответ человека, автоответ правил. */
type InboxBot = Pick<QualifierBot, "onIncoming" | "stopByHuman" | "isActive">;

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
    private readonly bot: InboxBot,
    private readonly clock: Clock,
    private readonly logger: Logger,
    /** Номер магазина: его в сообщениях с телефона компании писать можно. */
    private readonly shopPhone: () => Promise<string> = async () => "",
  ) {}

  /** Диалог по собеседнику; новый сразу связываем с клиентом по телефону. */
  private async upsert(m: InboundMessage, extra: IngestExtra): Promise<{ conv: Conversation; created: boolean }> {
    const existing = (await this.conversations.findByChat(m.chatType, m.channelId, m.chatId)) ?? (extra.anyWhatsappChannel && m.chatType === "whatsapp" ? await this.conversations.latestWhatsapp(m.chatId) : null);
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

  /** Сделка для диалога: открытая по клиенту/телефону или новая заявка (с нового номера — в «Неразобранное»). created — заявку завели сейчас. */
  private async ensureDeal(conv: Conversation, contactName: string, firstText: string): Promise<{ conv: Conversation; created: boolean }> {
    if (conv.dealId) return { conv, created: false };
    const phone = contactPhone(conv);
    // Код рекламной ссылки в первом сообщении («… (код: insta-bio)») — откуда пришёл клиент.
    const utm = await this.links.fromText(firstText);
    const existing = await this.sales.findOpenDeal({ clientId: conv.clientId, phone });
    if (existing && utm && !existing.utm) await this.sales.setUtmIfEmpty(existing.id, utm);
    const deal =
      existing ??
      (await this.sales.createDeal({
        title: `Заявка из ${channelLabel(conv.channel)}${contactName ? `: ${contactName}` : phone ? `: ${phoneTail(phone)}` : ""}`,
        channel: conv.channel,
        clientId: conv.clientId,
        contactName: contactTitle(conv, contactName, phoneTail),
        contactPhone: phone,
        contactEmail: contactEmail(conv),
        unsorted: true,
        utm,
      }));
    const linked = await this.conversations.linkDeal(conv.id, { dealId: deal.id, clientId: conv.clientId ?? deal.clientId, assigneeId: conv.assigneeId ?? deal.assigneeId });
    return { conv: linked, created: !existing };
  }

  async ingest(raw: InboundMessage, extra: IngestExtra = {}) {
    // Входящее, эхо и захват эха — по тексту без секретов: ссылка доступа не ложится в CRM открытым текстом,
    // а эхо нашего сообщения сравнивается с уже замаскированной записью.
    const m = withoutSecrets(raw);
    const { conv: base, created } = await this.upsert(m, extra);
    if (m.isEcho) {
      // Эхо нашего же сообщения из CRM: внешний ID уже записан при отправке (или запишется) — не дублируем.
      if (await this.messages.existsExternal(m.externalId)) return;
      if (await this.messages.claimPendingEcho(base.id, m.text, new Date(this.clock.now().getTime() - 120_000), m.externalId)) return;
      if (!(await this.messages.insertEcho(base.id, m))) return;
      await this.conversations.recordEcho(base.id, preview(m.text), m.at);
      // Ответил человек с телефона магазина — бот в этом диалоге больше не пишет (и не начнёт).
      await this.bot.stopByHuman(base.id, "phone").catch((err) => this.logger.error("bot stop", err));
      // С телефона компании (мимо CRM) ушли чужой номер, карта или реквизиты — запретить нельзя, руководитель узнаёт сразу.
      const found = findSensitive(m.text, [m.chatId, base.meta.phone, await this.shopPhone()]);
      if (found.length)
        await this.notifier.managers?.({
          kind: "system",
          title: `С телефона компании ушли ${[...new Set(found.map((f) => sensitiveLabels[f.kind]))].join(", ")}`,
          body: `${base.contactName || phoneTail(m.chatId) || "клиенту"}: ${found.map((f) => f.value).join(", ")}`,
          link: `/admin/chats?c=${base.id}`,
        });
      return;
    }
    if (!(await this.messages.insertIncoming(base.id, m, extra.subject ?? null))) return; // повторная доставка вебхука

    // Спам: сообщение сохраняем (на случай ошибки), но без заявки, уведомлений и правил.
    if (await this.blocklist.isBlocked(m.chatId, contactPhone({ chatId: m.chatId, meta: {} }))) {
      await this.conversations.closeAsSpam(base.id, preview(m.text), m.at);
      return;
    }
    const { conv, created: dealCreated } = await this.ensureDeal(base, m.contactName, m.text);
    await this.conversations.recordIncoming(conv.id, preview(m.text), m.at);
    const fresh = (await this.conversations.findById(conv.id)) ?? conv;
    // Пока бот ведёт опрос, отдельное уведомление на каждое сообщение не нужно: менеджер получит итог бота.
    const { quiet } = await this.bot.onIncoming(fresh, m, { created, dealCreated }).catch((err) => (this.logger.error("bot", err), { quiet: false }));
    if (!quiet)
      await this.notifier.notify(conv.assigneeId, "chats.view", {
        kind: "message",
        title: `${conv.contactName || m.contactName || phoneTail(conv.chatId) || conv.chatId} · ${channelLabel(conv.channel)}`,
        body: preview(m.text),
        link: `/admin/chats?c=${conv.id}`,
      });
    this.live.chatChanged(conv.id);
    await this.rules.messageIncoming({ subject: `${conv.id}:${m.at.toISOString().slice(0, 10)}`, conversationId: conv.id, dealId: conv.dealId, clientId: conv.clientId, channel: conv.channel });
  }

  /**
   * История переписки одного собеседника, загруженная из шлюза после привязки номера (сообщения по времени).
   * Только со знакомыми: уже есть диалог, клиент с этим номером или открытая сделка — с незнакомых номеров заявки
   * задним числом не заводим. Без уведомлений, бота, правил, «непрочитано» и «ждёт ответа»; повтор — без дублей.
   */
  async importHistory(history: InboundMessage[], extra: IngestExtra = {}): Promise<{ imported: number; skipped: "unknown" | "blocked" | null }> {
    if (!history.length) return { imported: 0, skipped: null };
    const chat = history.map(withoutSecrets);
    const sample = chat.find((m) => !m.isEcho) ?? chat[0];
    const phone = contactPhone({ chatId: sample.chatId, meta: extra.meta ?? {} });
    if (await this.blocklist.isBlocked(sample.chatId, phone)) return { imported: 0, skipped: "blocked" };
    const known =
      (await this.conversations.findByChat(sample.chatType, sample.channelId, sample.chatId)) ??
      (extra.anyWhatsappChannel && sample.chatType === "whatsapp" ? await this.conversations.latestWhatsapp(sample.chatId) : null);
    const clientId = extra.clientId ?? (phone ? await this.sales.findClientByPhone(phone) : null);
    const deal = known?.dealId ? null : await this.sales.findOpenDeal({ clientId: known?.clientId ?? clientId, phone });
    if (!known && !clientId && !deal) return { imported: 0, skipped: "unknown" };
    let { conv } = await this.upsert(sample, { ...extra, clientId: clientId ?? undefined });
    if (!conv.dealId && deal) conv = await this.conversations.linkDeal(conv.id, { dealId: deal.id, clientId: conv.clientId ?? deal.clientId, assigneeId: conv.assigneeId ?? deal.assigneeId });
    let imported = 0;
    let last: InboundMessage | null = null;
    for (const m of chat) {
      const ok = m.isEcho ? !(await this.messages.existsExternal(m.externalId)) && (await this.messages.insertEcho(conv.id, m)) : await this.messages.insertIncoming(conv.id, m, null);
      if (!ok) continue;
      imported++;
      if (!last || m.at > last.at) last = m;
    }
    if (last) {
      await this.conversations.recordHistory(conv.id, preview(last.text), last.at);
      this.live.chatChanged(conv.id);
    }
    return { imported, skipped: null };
  }

  async applyStatus(s: DeliveryStatus) {
    const msg = await this.messages.byExternalId(s.externalId);
    if (!msg || !shouldApplyStatus(msg.status, s.status)) return;
    await this.messages.setStatus(msg.id, s.status, s.error);
    this.live.chatChanged(msg.conversationId);
  }

  /** Отправка из CRM: менеджером или правилом/ботом (authorId = null, source — кто именно). */
  async send(conversationId: string, text: string, authorId: string | null, source?: MessageSource) {
    const conv = await this.conversations.findById(conversationId);
    if (!conv) throw new Error("Диалог не найден");
    const body = text.trim().slice(0, 4000);
    if (!body) throw new Error("Пустое сообщение");
    // Ответил менеджер — бот замолкает (до записи ответа: она тоже помечает бота остановленным).
    if (authorId) await this.bot.stopByHuman(conversationId, "crm").catch((err) => this.logger.error("bot stop", err));
    // Клиенту уходит текст целиком, в CRM — с маской секретов (ссылка «задайте пароль»).
    const msg = await this.messages.insertOutgoing(conversationId, redactSecrets(body), authorId, false, authorId ? undefined : source);
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

  /**
   * Сообщение правила автоматизации. Если диалог ведёт бот, правило-автоответ молчит: иначе клиент получит два
   * автоответа подряд (бот и «ответим утром»). null — не отправлено.
   */
  async sendAutomated(conversationId: string, text: string) {
    if (await this.bot.isActive(conversationId)) return null;
    return this.send(conversationId, text, null, "rule");
  }

  /** Внутренняя заметка: видна только сотрудникам, клиенту не уходит и не сбрасывает «ждёт ответа». authorId null — от CRM (итог бота). */
  async addInternalNote(conversationId: string, text: string, authorId: string | null, source?: MessageSource) {
    const body = redactSecrets(text.trim().slice(0, 4000));
    if (!body) throw new Error("Пустая заметка");
    return this.messages.insertOutgoing(conversationId, body, authorId, true, authorId ? undefined : source);
  }

  /**
   * Диалог счёта — к клиенту, если он ещё ни к кому не привязан (клиент завёлся или нашёлся оплатой): карточка
   * клиента видит переписку. Чужой клиент не перезаписывается.
   */
  async linkClient(conversationId: string, clientId: string) {
    const conv = await this.conversations.findById(conversationId);
    if (!conv || conv.clientId) return;
    await this.conversations.updateContact(conv.id, { contactName: conv.contactName, avatarUrl: conv.avatarUrl, meta: conv.meta, clientId });
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
  /** Клиента завели из сделки: её диалоги без клиента привязываются к нему (карточка клиента видит переписку). */
  linkDealClient(dealId: string, clientId: string) {
    return this.conversations.linkClientByDeal(dealId, clientId);
  }

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
   * «Перезвоните мне»: сделка (открытая по телефону или новая — её ответственного выбирает круг), задача «позвонить»
   * через 15 минут на ответственного сделки и уведомление — чтобы заявка не потерялась.
   */
  async requestCallback(input: { name: string; phone: string; comment?: string; page?: string; userId?: string | null }) {
    const phone = normalizePhone(input.phone);
    const clientId = input.userId ?? (await this.sales.findClientByPhone(phone));
    const who = input.name || phoneTail(phone);
    const deal = (await this.sales.findOpenDeal({ clientId, phone })) ?? (await this.sales.createDeal({ title: `Перезвонить: ${who}`, channel: "site", source: "site", clientId, contactName: input.name, contactPhone: phone, contactEmail: null, unsorted: true, utm: null }));
    // Ответственного новой сделке ставит круг при создании; вне рабочего времени — утром, а задачу видят все.
    const assigneeId = deal.assigneeId;
    const note = [`📞 Заявка на обратный звонок с сайта: ${input.name || "без имени"}, ${phoneTail(phone)} (номер — в контакте сделки)`, input.comment ? `Комментарий: ${input.comment}` : "", input.page ? `Страница: ${input.page}` : ""].filter(Boolean).join("\n");
    await this.sales.note(deal, note);
    await this.tasks.create({ title: `Перезвонить ${who} — заявка с сайта`, kind: "call", dueAt: new Date(this.clock.now().getTime() + 15 * 60_000), dealId: deal.id, clientId: deal.clientId, assigneeId });
    await this.notifier.notify(assigneeId, "deals.view", { kind: "task", title: `Перезвонить: ${who}`, body: input.comment?.slice(0, 160) || "Заявка на обратный звонок с сайта", link: `/admin/deals/${deal.id}` });
    this.live.notificationsChanged();
    return deal.id;
  }
}
