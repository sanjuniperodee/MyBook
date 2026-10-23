import type { Clock, Logger, WorkSchedule } from "@/shared/application";
import { normalizePhone, phoneTail } from "@/shared/domain/phone";
import {
  asksNoMessages,
  channelLabel,
  contactChanges,
  contactEmail,
  contactPhone,
  contactTitle,
  safeContactName,
  findSensitive,
  DEFAULT_RULE_SENDING,
  inRuleWindow,
  localDayStart,
  preview,
  redactSecrets,
  sensitiveWhat,
  ruleSendBlock,
  ruleSendBlockText,
  shouldApplyStatus,
  type Conversation,
  type ConversationMeta,
  type DeliveryStatus,
  type InboundMessage,
  type RuleSendBlock,
  type RuleSendingPolicy,
} from "../domain";
import { zonedDay } from "@/shared/domain/time";
import type { QualifierBot } from "./bot";
import type { AnsweredTasks, BlockReason, Blocklist, ChannelTransport, ConversationRepository, IncomingRules, LinkAttribution, LiveUpdates, MessageRepository, MessageSource, OutgoingFile, SalesGateway, StaffLine, StaffNotifier, StoredMessage, Tasks } from "./ports";

/** WhatsApp даёт изменить отправленное 15 минут, удалить «для всех» — около двух суток. */
export const EDIT_WINDOW_MS = 15 * 60_000;
export const REVOKE_WINDOW_MS = 48 * 3_600_000;

/** Что нельзя сделать с сообщением — текстом для сотрудника. */
export class MessageActionError extends Error {
  readonly isMessageAction = true;
  static is(err: unknown): err is MessageActionError {
    return typeof err === "object" && err !== null && (err as { isMessageAction?: boolean }).isMessageAction === true;
  }
}

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
  /** Без уведомления о сообщении: о пропущенном звонке сотрудник уже узнал из журнала звонков. */
  silent?: boolean;
}

/** Карточка клиента или сделки: её телефоны и (по id) идентификаторы собеседников её диалогов. */
export interface ContactsTarget {
  dealId?: string | null;
  clientId?: string | null;
  phones: readonly (string | null | undefined)[];
}

/** До скольких считать отправленные за сутки для экрана настроек (лимит правил не больше этого). */
const RULE_SENDING_COUNT_CAP = 1000;

/** Заметка в чате, когда клиент сам попросил не писать (номер — в стоп-лист «Не писать первым»). */
const NO_MESSAGES_NOTE =
  "🔕 Клиент попросил больше не писать — номер в стоп-листе «Не писать первым»: бот не напоминает о себе, правила автоматизаций не пишут. Отвечать на его сообщения можно. Если это ошибка — «Писать первым: можно» в карточке клиента или сделки.";

/** Бот в инбоксе: входящие, ответ человека, автоответ правил. */
type InboxBot = Pick<QualifierBot, "onIncoming" | "stopByHuman" | "isActive">;

/** Автосообщение клиенту без почты не уходит, если бот или правило писали ему за сутки, а менеджер — за двое суток. */
const RECENT_AUTO_MS = 24 * 3_600_000;
const RECENT_HUMAN_MS = 48 * 3_600_000;

/** Единый инбокс: входящие из всех каналов, отправка ответов, статусы доставки. */
export class MessagingService {
  /** День, за который руководители уже узнали, что лимит сообщений от правил исчерпан (одно уведомление в сутки). */
  #limitAlertDay = "";

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
    /** Кто сейчас держит телефон WhatsApp магазина (настройка в «Чатах»); null — не указано. */
    private readonly phoneHolder: () => Promise<{ id: string; name: string } | null> = async () => null,
    /** Окно и суточный лимит сообщений от правил («Интеграции» → «Мессенджеры»). */
    private readonly ruleSending: () => Promise<RuleSendingPolicy> = async () => DEFAULT_RULE_SENDING,
    /** Номера сотрудников и служебные сообщения им (напоминания о задачах): не заявки. null — не различаем. */
    private readonly staffLine: StaffLine | null = null,
    /** Задачи «ответить» по сделке закрываются ответом клиенту. null — не закрываются. */
    private readonly answeredTasks: AnsweredTasks | null = null,
  ) {}

  /**
   * Клиенту ответил человек — из CRM (ушло) или с телефона магазина (эхо): задачи «ответить» по сделке диалога сделаны
   * (automation-12). Один UPDATE по индексу открытых задач сделки; сбой не мешает ответу.
   */
  private async answered(conv: Conversation) {
    if (conv.dealId && this.answeredTasks) await this.answeredTasks.answered(conv.dealId).catch((err) => this.logger.error("tasks answered", err));
  }

  /** Переписка в WhatsApp с номером действующего сотрудника (сбой проверки — как с клиентом: заявку не теряем). */
  private async isStaffChat(m: InboundMessage, extra: IngestExtra) {
    if (!this.staffLine || m.chatType !== "whatsapp") return false;
    const phone = contactPhone({ chatId: m.chatId, meta: extra.meta ?? {} });
    return !!phone && (await this.staffLine.isStaffPhone(phone).catch((err) => (this.logger.error("staff phone", err), false)));
  }

  /**
   * Сообщение с номера сотрудника или ему с телефона магазина (ответ на напоминание, переписка коллег): сохраняется
   * в его диалоге тихо — без «непрочитано» и «ждёт ответа»; заявки, бота, правил, уведомлений и захвата заявки
   * «с телефона магазина» нет (tasks-d5).
   */
  private async ingestStaff(m: InboundMessage, extra: IngestExtra) {
    const { conv } = await this.upsert(m, extra);
    if (m.isEcho) {
      if (await this.messages.existsExternal(m.externalId)) return;
      if (await this.messages.claimPendingEcho(conv.id, m.text, new Date(Math.min(this.clock.now().getTime(), m.at.getTime()) - 120_000), m.externalId)) return;
      if (!(await this.messages.insertEcho(conv.id, m))) return;
    } else if (!(await this.messages.insertIncoming(conv.id, m, extra.subject ?? null))) return;
    await this.conversations.recordHistory(conv.id, preview(m.text), m.at);
    this.live.chatChanged(conv.id);
  }

  /**
   * Ответили клиенту с телефона магазина (мимо CRM): отвечал тот, у кого сейчас телефон. Новая заявка (неразобранная
   * или на первом этапе) и чат переходят к нему, даже если круг уже отдал их другому; прежнему ответственному —
   * уведомление. Заявки в работе у коллег не перехватываются.
   */
  private async claimByPhone(conv: Conversation) {
    const holder = await this.phoneHolder().catch(() => null);
    if (!holder) return;
    let from: string | null = null;
    if (conv.dealId && this.sales.claimNewLead) {
      const r = await this.sales.claimNewLead(conv.dealId, holder.id, "ответ клиенту с телефона магазина");
      if (!r.claimed) return;
      from = r.previous;
    } else if (conv.assigneeId && conv.assigneeId !== holder.id) return;
    if (conv.assigneeId !== holder.id) await this.conversations.setAssignee(conv.id, holder.id);
    if (from && from !== holder.id)
      await this.notifier.notify(from, "chats.view", { kind: "message", title: `Заявку взял(а) ${holder.name}: ответил(а) с телефона WhatsApp`, body: conv.contactName || phoneTail(conv.chatId) || "клиент", link: `/admin/chats?c=${conv.id}` });
    this.live.chatChanged(conv.id);
  }

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
    // Эхо напоминания, которое CRM отправила сотруднику с номера магазина, — не переписка: ни диалога, ни заявки.
    if (raw.isEcho && this.staffLine?.isServiceEcho(raw)) return;
    // Входящее, эхо и захват эха — по тексту без секретов: ссылка доступа не ложится в CRM открытым текстом,
    // а эхо нашего сообщения сравнивается с уже замаскированной записью.
    const clean = withoutSecrets(raw);
    const m = { ...clean, contactName: safeContactName(clean.contactName) };
    // Номер действующего сотрудника — служебная переписка, не заявка.
    if (await this.isStaffChat(m, extra)) return this.ingestStaff(m, extra);
    const { conv: base, created } = await this.upsert(m, extra);
    if (m.isEcho) {
      // Эхо нашего же сообщения из CRM: внешний ID уже записан при отправке (или запишется) — не дублируем.
      if (await this.messages.existsExternal(m.externalId)) return;
      // Окно «только что отправили» — от времени самого сообщения: эхо, догнанное сверкой со шлюзом, приходит позже.
      if (await this.messages.claimPendingEcho(base.id, m.text, new Date(Math.min(this.clock.now().getTime(), m.at.getTime()) - 120_000), m.externalId)) return;
      // Ответ с телефона магазина — в отчёт по менеджерам тому, у кого сейчас телефон (analytics-d3).
      const holder = await this.phoneHolder().catch(() => null);
      if (!(await this.messages.insertEcho(base.id, m, holder?.id ?? null))) return;
      await this.conversations.recordEcho(base.id, preview(m.text), m.at);
      // Ответ с телефона магазина — в открытых вкладках CRM сразу, а не со следующим опросом.
      this.live.chatChanged(base.id);
      await this.answered(base);
      // Ответил человек с телефона магазина — бот в этом диалоге больше не пишет (и не начнёт).
      await this.bot.stopByHuman(base.id, "phone").catch((err) => this.logger.error("bot stop", err));
      // Отвечал тот, у кого сейчас телефон: новая заявка — его.
      await this.claimByPhone(base).catch((err) => this.logger.error("phone claim", err));
      // С телефона компании (мимо CRM) ушли чужой номер, карта или реквизиты — запретить нельзя, руководитель узнаёт сразу.
      const found = findSensitive(m.text, [m.chatId, base.meta.phone, await this.shopPhone()]);
      if (found.length)
        await this.notifier.managers?.({
          kind: "system",
          title: `С телефона компании ушли ${sensitiveWhat(found)}`,
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
    // Любое сообщение клиента открывает «ждёт ответа»; нужен ли ответ на «Аха» или «спасибо», решает AI (бот снимает
    // ожидание сам), а не словарь.
    await this.conversations.recordIncoming(conv.id, preview(m.text), m.at);
    // «Не пишите мне» — номер в стоп-лист «Не писать первым» (до бота и правил: напоминание и сообщение правила уже не уйдут).
    if (asksNoMessages(m.text)) await this.optOut(conv, m.text).catch((err) => this.logger.error("no marketing", err));
    // Сообщение уже в базе — открытые вкладки CRM показывают его сразу, не дожидаясь бота, уведомлений и правил.
    this.live.chatChanged(conv.id);
    const fresh = (await this.conversations.findById(conv.id)) ?? conv;
    // Пока бот ведёт опрос, отдельное уведомление на каждое сообщение не нужно: менеджер получит итог бота.
    const { quiet } = await this.bot.onIncoming(fresh, m, { created, dealCreated }).catch((err) => (this.logger.error("bot", err), { quiet: false }));
    if (!quiet && !extra.silent)
      await this.notifier.notify(conv.assigneeId, "chats.view", {
        kind: "message",
        title: `${conv.contactName || m.contactName || phoneTail(conv.chatId) || conv.chatId} · ${channelLabel(conv.channel)}`,
        body: preview(m.text),
        link: `/admin/chats?c=${conv.id}`,
      });
    // Бот мог взять диалог (плашка «ведёт бот») — ещё раз.
    this.live.chatChanged(conv.id);
    await this.rules.messageIncoming({ subject: `${conv.id}:${m.at.toISOString().slice(0, 10)}`, conversationId: conv.id, dealId: conv.dealId, clientId: conv.clientId, channel: conv.channel });
  }

  /** Клиент написал «не пишите мне»: его номер — в «Не писать первым» (один раз), менеджеру — заметка в чате. */
  private async optOut(conv: Conversation, text: string) {
    const values = [conv.chatId, contactPhone(conv)].filter((v): v is string => !!v);
    if (await this.blocklist.noMarketing(...values)) return;
    await this.blocklist.add(values, null, { reason: "no_marketing", note: `Клиент написал: «${preview(text)}»` });
    await this.addInternalNote(conv.id, NO_MESSAGES_NOTE, null, "rule");
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

  /**
   * Сверка со шлюзом: сообщения одного собеседника из хранилища шлюза, которых нет в CRM, — вебхук не дошёл (сайт
   * перезапускался или отвечал дольше, чем ждёт шлюз). Новее последнего сообщения диалога — обычный путь входящего
   * (заявка, «ждёт ответа», уведомление, бот); старше — тихо в историю, чтобы не поднять «ждёт ответа» поверх ответа
   * менеджера. Возвращает, сколько сообщений догнали.
   */
  async catchUp(chat: InboundMessage[], extra: IngestExtra = {}): Promise<number> {
    if (!chat.length) return 0;
    const known = await this.messages.knownExternal(chat.map((m) => m.externalId));
    const missed = chat.filter((m) => !known.has(m.externalId)).sort((a, b) => a.at.getTime() - b.at.getTime());
    if (!missed.length) return 0;
    const sample = missed[0];
    const conv =
      (await this.conversations.findByChat(sample.chatType, sample.channelId, sample.chatId)) ??
      (extra.anyWhatsappChannel && sample.chatType === "whatsapp" ? await this.conversations.latestWhatsapp(sample.chatId) : null);
    const last = conv?.lastMessageAt?.getTime() ?? null;
    const late = last === null ? [] : missed.filter((m) => m.at.getTime() < last);
    const live = missed.filter((m) => !late.includes(m));
    let caught = late.length ? (await this.importHistory(late, extra)).imported : 0;
    for (const m of live) {
      await this.ingest(m, extra);
      caught++;
    }
    return caught;
  }

  async applyStatus(s: DeliveryStatus) {
    const msg = await this.messages.byExternalId(s.externalId);
    if (!msg || !shouldApplyStatus(msg.status, s.status)) return;
    await this.messages.setStatus(msg.id, s.status, s.error);
    this.live.chatChanged(msg.conversationId);
  }

  /** Сообщение этого диалога, на которое отвечают: его id в канале (для цитаты в WhatsApp). */
  private async replyTarget(conversationId: string, replyToId: string | null | undefined) {
    if (!replyToId) return null;
    const m = await this.messages.findOne(replyToId);
    return m && m.conversationId === conversationId && !m.internal && !m.deletedAt ? m : null;
  }

  /** Отправка из CRM: менеджером или правилом/ботом (authorId = null, source — кто именно); ответом или пересланным. */
  async send(conversationId: string, text: string, authorId: string | null, source?: MessageSource, opts: { replyToId?: string | null; forwarded?: boolean } = {}) {
    const conv = await this.conversations.findById(conversationId);
    if (!conv) throw new Error("Диалог не найден");
    const body = text.trim().slice(0, 4000);
    if (!body) throw new Error("Пустое сообщение");
    // Ответил менеджер — бот замолкает (до записи ответа: она тоже помечает бота остановленным).
    if (authorId) await this.bot.stopByHuman(conversationId, "crm").catch((err) => this.logger.error("bot stop", err));
    const reply = await this.replyTarget(conversationId, opts.replyToId);
    // Клиенту уходит текст целиком, в CRM — с маской секретов (ссылка «задайте пароль»).
    const msg = await this.messages.insertOutgoing(conversationId, redactSecrets(body), authorId, false, authorId ? undefined : source, { replyToId: reply?.id ?? null, forwarded: opts.forwarded });
    await this.conversations.recordOutgoing(conversationId, preview(body), this.clock.now(), authorId);
    if (authorId && conv.dealId) await this.sales.acceptUnsorted(conv.dealId, authorId, "ответ клиенту в чате");
    this.live.chatChanged(conversationId);
    const r = await this.transport.send(conv, msg.id, body, { replyTo: reply?.externalId ?? null, forwarded: opts.forwarded });
    if (!r.ok) {
      await this.messages.setStatus(msg.id, "error", r.error);
      this.live.chatChanged(conversationId);
      return { ...msg, status: "error" as const, error: r.error };
    }
    await this.messages.attachExternalId(msg.id, r.externalId);
    if (conv.channel === "email") this.live.chatChanged(conversationId);
    if (authorId) await this.answered(conv);
    return { ...msg, externalId: r.externalId, status: "sent" as const };
  }

  /**
   * Файл клиенту от сотрудника (фото, видео, голосовое, документ) с подписью; mediaUrl — где файл лежит у нас (чтобы
   * открыть его в CRM). Ответом на сообщение или пересланным.
   */
  async sendFile(conversationId: string, file: OutgoingFile, caption: string, authorId: string, opts: { mediaUrl: string | null; replyToId?: string | null; forwarded?: boolean }) {
    const conv = await this.conversations.findById(conversationId);
    if (!conv) throw new Error("Диалог не найден");
    if (!this.transport.sendFile) throw new MessageActionError("Отправка файлов в этом канале недоступна");
    await this.bot.stopByHuman(conversationId, "crm").catch((err) => this.logger.error("bot stop", err));
    const reply = await this.replyTarget(conversationId, opts.replyToId);
    const text = caption.trim().slice(0, 1000);
    const msg = await this.messages.insertOutgoing(conversationId, redactSecrets(text), authorId, false, undefined, { type: file.kind, mediaUrl: opts.mediaUrl, replyToId: reply?.id ?? null, forwarded: opts.forwarded });
    const label = file.kind === "image" ? "📷 Фото" : file.kind === "video" ? "🎬 Видео" : file.kind === "audio" ? "🎤 Голосовое" : `📎 ${file.name}`;
    await this.conversations.recordOutgoing(conversationId, preview(text || label), this.clock.now(), authorId);
    if (conv.dealId) await this.sales.acceptUnsorted(conv.dealId, authorId, "ответ клиенту в чате");
    this.live.chatChanged(conversationId);
    const r = await this.transport.sendFile(conv, file, { caption: text, replyTo: reply?.externalId ?? null, forwarded: opts.forwarded });
    if (!r.ok) {
      await this.messages.setStatus(msg.id, "error", r.error);
      this.live.chatChanged(conversationId);
      return { ...msg, status: "error" as const, error: r.error };
    }
    await this.messages.attachExternalId(msg.id, r.externalId);
    this.live.chatChanged(conversationId);
    await this.answered(conv);
    return { ...msg, externalId: r.externalId, status: "sent" as const };
  }

  /**
   * Файл клиенту от бота (подборка материалов продажника): бот не останавливается и сделку на себя не берёт; в CRM —
   * сообщение «бот» со ссылкой на файл. false — канал не умеет файлы или отправка не удалась.
   */
  async sendBotFile(conversationId: string, file: OutgoingFile, caption: string, mediaUrl: string): Promise<boolean> {
    const conv = await this.conversations.findById(conversationId);
    if (!conv || !this.transport.sendFile) return false;
    const text = caption.trim().slice(0, 1000);
    const msg = await this.messages.insertOutgoing(conversationId, text, null, false, "bot", { type: file.kind, mediaUrl });
    const label = file.kind === "image" ? "📷 Фото" : file.kind === "video" ? "🎬 Видео" : `📎 ${file.name}`;
    await this.conversations.recordOutgoing(conversationId, preview(text || label), this.clock.now(), null);
    this.live.chatChanged(conversationId);
    const r = await this.transport.sendFile(conv, file, { caption: text });
    if (!r.ok) {
      await this.messages.setStatus(msg.id, "error", r.error);
      this.live.chatChanged(conversationId);
      return false;
    }
    await this.messages.attachExternalId(msg.id, r.externalId);
    this.live.chatChanged(conversationId);
    return true;
  }

  /** Своё сообщение или заметку сотрудник меняет и удаляет сам; чужие и сообщения клиента — нет. */
  private async ownMessage(conversationId: string, messageId: string, authorId: string): Promise<StoredMessage> {
    const m = await this.messages.findOne(messageId);
    if (!m || m.conversationId !== conversationId) throw new MessageActionError("Сообщение не найдено");
    if (m.deletedAt) throw new MessageActionError("Сообщение уже удалено");
    if (m.direction !== "out" || m.authorId !== authorId) throw new MessageActionError("Изменить и удалить можно только своё сообщение");
    return m;
  }

  /** Изменить текст своего сообщения: у клиента тоже (WhatsApp — 15 минут), заметку — в любое время. */
  async editMessage(conversationId: string, messageId: string, text: string, authorId: string) {
    const m = await this.ownMessage(conversationId, messageId, authorId);
    const body = text.trim().slice(0, 4000);
    if (!body) throw new MessageActionError("Пустое сообщение");
    if (m.type !== "text") throw new MessageActionError("Изменить можно только текст");
    if (!m.internal) {
      if (this.clock.now().getTime() - m.createdAt.getTime() > EDIT_WINDOW_MS) throw new MessageActionError("WhatsApp даёт изменить сообщение только в первые 15 минут");
      const conv = await this.conversations.findById(conversationId);
      if (!conv) throw new MessageActionError("Диалог не найден");
      if (!m.externalId && conv.channel !== "site") throw new MessageActionError("Сообщение ещё не доставлено — подождите пару секунд");
      const r = this.transport.edit ? await this.transport.edit(conv, m.externalId ?? "", body) : { ok: false as const, error: "Канал не поддерживает правку" };
      if (!r.ok) throw new MessageActionError(r.error);
    }
    await this.messages.editText(m.id, redactSecrets(body), this.clock.now());
    this.live.chatChanged(conversationId);
  }

  /** Удалить своё сообщение: у клиента — «удалить для всех» (около двух суток), заметку — в любое время. */
  async deleteMessage(conversationId: string, messageId: string, authorId: string) {
    const m = await this.ownMessage(conversationId, messageId, authorId);
    if (!m.internal && m.status !== "error") {
      if (this.clock.now().getTime() - m.createdAt.getTime() > REVOKE_WINDOW_MS) throw new MessageActionError("WhatsApp даёт удалить сообщение у клиента только в первые двое суток");
      const conv = await this.conversations.findById(conversationId);
      if (!conv) throw new MessageActionError("Диалог не найден");
      if (m.externalId || conv.channel === "site") {
        const r = this.transport.revoke ? await this.transport.revoke(conv, m.externalId ?? "") : { ok: false as const, error: "Канал не поддерживает удаление" };
        if (!r.ok) throw new MessageActionError(r.error);
      }
    }
    await this.messages.markDeleted(m.id, this.clock.now());
    this.live.chatChanged(conversationId);
  }

  /**
   * Сообщение правила автоматизации. Если диалог ведёт бот, правило-автоответ молчит: иначе клиент получит два
   * автоответа подряд (бот и «ответим утром»). Сообщение о заказе (transactional: статус, трек) уходит и в такой диалог —
   * бот его не заменит; бот при этом не останавливается (chats-15). Номер в стоп-листе («не писать первым» или спам) — не
   * уходит (contacts-18), о заказе — с заметкой в сделку. В тексте чужой номер, карта, IBAN или ссылка на перевод Kaspi
   * (шаблон правила или подставленное поле) — не уходит: заметка в сделку и уведомление руководителю (chats-d4). Номер
   * самого клиента и магазина, значения allow (трек-номер) — можно. Вне окна по Алматы или сверх суточного лимита
   * сообщений от правил — не уходит, заметка в сделку (automation-15); автоответ на сообщение клиента (reply) окно и
   * лимит не держат. Заметка о пропуске — в noteDealId (сделка заказа: диалог мог остаться привязан к прошлой сделке
   * клиента или ни к какой), без него — в сделку диалога. null — не отправлено. defer — событийное правило дошлёт
   * сообщение само, когда окно откроется (automation-d1): вне окна и сверх лимита — status deferred, без заметки.
   */
  async sendAutomated(conversationId: string, text: string, opts: { rule?: string; reply?: boolean; transactional?: boolean; allow?: readonly string[]; noteDealId?: string | null; defer?: boolean } = {}) {
    if (!opts.transactional && (await this.bot.isActive(conversationId))) return null;
    const conv = await this.conversations.findById(conversationId);
    if (!conv) throw new Error("Диалог не найден");
    const rule = opts.rule ? `Правило «${opts.rule}»` : "Правило автоматизации";
    const note = async (body: string) => {
      const dealId = opts.noteDealId || conv.dealId;
      const deal = dealId ? await this.sales.deal(dealId) : null;
      if (deal) await this.sales.note(deal, body);
    };
    // Клиент просил не писать первым (или номер в спаме) — правила ему не пишут, даже автоответом.
    if (await this.blocklist.noMarketing(conv.chatId, contactPhone(conv))) {
      this.logger.info(`${rule}: диалог ${conv.id} — «не писать первым», сообщение не отправлено`);
      if (opts.transactional) await note(`${rule} не отправило клиенту сообщение о заказе: клиент просил не писать первым (стоп-лист). Если нужно — напишите клиенту сами.`);
      return null;
    }
    const found = findSensitive(text, [conv.chatId, conv.meta.phone, await this.shopPhone(), ...(opts.allow ?? [])]);
    if (found.length) {
      const what = sensitiveWhat(found);
      const values = found.map((f) => f.value).join(", ");
      this.logger.warn(`${rule}: сообщение в диалог ${conv.id} не отправлено — ${what}`);
      await note(`${rule} не отправило клиенту сообщение: в тексте ${what} (${values}). Оплата — только через счёт из CRM; проверьте текст правила в «Автоматизациях».`);
      await this.notifier.managers?.({ kind: "system", title: `${rule} не отправило сообщение: в тексте ${what}`, body: `${conv.contactName || phoneTail(conv.chatId) || "клиенту"}: ${values}`, link: `/admin/chats?c=${conv.id}` });
      return null;
    }
    // Правило пишет первым — только в окне и в пределах суточного лимита (automation-15). Автоответ на только что
    // пришедшее сообщение клиента (reply) уходит в любое время, но в счёт лимита идёт.
    if (!opts.reply) {
      const { block, policy } = await this.ruleGate();
      if (block) {
        if (opts.defer) return { status: "deferred" as const };
        const why = ruleSendBlockText(block, policy);
        this.logger.warn(`${rule}: сообщение в диалог ${conv.id} не отправлено — ${why}`);
        await note(`${rule} не отправило клиенту сообщение: ${why}. Если нужно — напишите клиенту сами. Окно и лимит — «Интеграции» → «Мессенджеры».`);
        return null;
      }
    }
    return this.send(conversationId, text, null, "rule");
  }

  /**
   * Автосообщение клиенту без почты (automation-16): дедлайн к празднику, «книга почти готова», «оплатите», отзыв — в
   * его последнюю переписку WhatsApp, как сообщение правила (sendAutomated: бот ведёт — молчим, стоп-лист, реквизиты,
   * окно и лимит). Первым на новый номер не пишем: переписки нет — no_chat. Клиенту не пишут втроём: за сутки писали бот
   * или правило, а за двое — менеджер (из CRM или с телефона магазина) — recent. skipped — не пропустил sendAutomated.
   */
  async sendToClient(clientId: string, text: string, opts: { rule: string }): Promise<"sent" | "no_chat" | "recent" | "skipped"> {
    const conv = await this.conversations.latestWhatsappOfClient(clientId);
    if (!conv) return "no_chat";
    const now = this.clock.now().getTime();
    const last = await this.messages.lastOutgoing(conv.id, new Date(now - RECENT_HUMAN_MS));
    if (last.human || (last.auto && now - last.auto.getTime() < RECENT_AUTO_MS)) return "recent";
    // Вне окна и сверх лимита — молча: автописьма пробуют каждые 15 минут, заметка в сделку на каждый проход не нужна.
    if ((await this.ruleBlockNow()).block) return "skipped";
    const sent = await this.sendAutomated(conv.id, text, { rule: opts.rule });
    return sent && sent.status !== "error" ? "sent" : "skipped";
  }

  /**
   * Может ли правило сейчас написать клиенту первым: окно по Алматы и суточный лимит сообщений от правил. null —
   * можно; «забросил книгу», годовщина и праздник вне окна и сверх лимита не застолбляют объект и сработают в следующем
   * проходе, остальные правила срабатывают, а сообщение не уходит (заметка в сделку).
   */
  async ruleSendBlock(): Promise<RuleSendBlock | null> {
    return (await this.ruleGate()).block;
  }

  /**
   * Почему правило сейчас не напишет клиенту первым — для подписи в карточке заказа: «вне окна 09:00–21:00 (Алматы)»,
   * «лимит 40 сообщений от правил в сутки исчерпан»; null — напишет. Руководителям о лимите не сообщает.
   */
  async ruleSendPause(): Promise<string | null> {
    const { block, policy } = await this.ruleBlockNow();
    return block ? ruleSendBlockText(block, policy) : null;
  }

  /** Окно и лимит на сейчас; сколько ушло за сутки, считаем только в окне. */
  private async ruleBlockNow(): Promise<{ block: RuleSendBlock | null; policy: RuleSendingPolicy; now: Date }> {
    const policy = await this.ruleSending();
    const now = this.clock.now();
    if (!inRuleWindow(now, policy)) return { block: "window", policy, now };
    const sent = policy.dailyLimit > 0 ? await this.messages.countRuleSince(localDayStart(now), policy.dailyLimit) : 0;
    return { block: ruleSendBlock(policy, now, sent), policy, now };
  }

  /** Окно и лимит перед отправкой правила. Лимит исчерпан — руководителям раз в сутки. */
  private async ruleGate(): Promise<{ block: RuleSendBlock | null; policy: RuleSendingPolicy }> {
    const { block, policy, now } = await this.ruleBlockNow();
    if (block === "limit" && policy.dailyLimit > 0) await this.limitAlert(policy, now).catch((err) => this.logger.error("rule limit alert", err));
    return { block, policy };
  }

  private async limitAlert(policy: RuleSendingPolicy, now: Date) {
    const day = zonedDay(now);
    if (this.#limitAlertDay === day) return;
    this.#limitAlertDay = day;
    await this.notifier.managers?.({
      kind: "system",
      title: `Сообщения от правил на сегодня закончились: ${policy.dailyLimit} в сутки`,
      body: "До завтра правила автоматизаций клиентам первыми не пишут — бережём номер WhatsApp. Автоответы уходят. Лимит — «Интеграции» → «Мессенджеры».",
      link: "/admin/settings?tab=messengers",
    });
  }

  /** Окно, лимит и сколько сообщений от правил ушло сегодня — для настроек. */
  async ruleSendingToday() {
    const policy = await this.ruleSending();
    return { policy, sent: await this.messages.countRuleSince(localDayStart(this.clock.now()), RULE_SENDING_COUNT_CAP) };
  }

  /**
   * Пересылка в другие диалоги: текст или подпись уходят их клиентам. Чужой для получателя номер (например, другого
   * клиента), карта, IBAN или ссылка на перевод Kaspi — MessageActionError до отправки (chats-d4); номер самого
   * получателя и магазина — можно.
   */
  async assertForwardable(text: string, targetIds: readonly string[]) {
    if (!text.trim()) return;
    const shop = await this.shopPhone();
    for (const id of targetIds) {
      const conv = await this.conversations.findById(id);
      const found = conv ? findSensitive(text, [conv.chatId, conv.meta.phone, shop]) : [];
      if (found.length) throw new MessageActionError(`В сообщении ${sensitiveWhat(found)} — переслать его нельзя. Оплата — только через счёт или ссылку из CRM, контакты клиента — через CRM.`);
    }
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

  /** Первым писать нельзя: клиент просил («не писать первым») или номер в спаме. */
  noMarketing(...values: (string | null | undefined)[]) {
    return this.blocklist.noMarketing(...values);
  }

  /** Номера карточки: телефоны (нормализованные) и собеседники её диалогов — без повторов. */
  private async contactsOf(target: ContactsTarget) {
    const phones = target.phones.map((p) => normalizePhone(p)).filter((p) => p.length >= 10);
    const [byDeal, byClient] = await Promise.all([target.dealId ? this.conversations.chatIdsByDeal(target.dealId) : [], target.clientId ? this.conversations.chatIdsByClient(target.clientId) : []]);
    return [...new Set([...phones, ...byDeal, ...byClient].filter(Boolean))];
  }

  /** «Не писать первым» у карточки клиента или сделки: хотя бы один её номер или собеседник в стоп-листе. */
  async noMarketingFor(target: ContactsTarget) {
    const values = await this.contactsOf(target);
    return values.length ? this.blocklist.noMarketing(...values) : false;
  }

  /** Номер или собеседник карточки в спаме: «можно писать первым» спам не снимает (его убирают в стоп-листе). */
  async spamFor(target: ContactsTarget) {
    const values = await this.contactsOf(target);
    return values.length ? this.blocklist.isBlocked(...values) : false;
  }

  /**
   * Кнопка «Не писать первым» в карточке клиента или сделки: on — все её номера и собеседники в стоп-лист, off — снять
   * эту отметку (спам так не снимается). Возвращает номера, которых это коснулось.
   */
  async setNoMarketing(target: ContactsTarget, on: boolean, byUserId: string, note?: string | null) {
    const values = await this.contactsOf(target);
    if (!values.length) throw new MessageActionError("У клиента нет ни номера телефона, ни переписки");
    if (on) await this.blocklist.add(values, byUserId, { reason: "no_marketing", note: note ?? null });
    else await this.blocklist.remove(values, "no_marketing");
    return values;
  }

  /** Номер в стоп-лист вручную («Интеграции» → CRM → «Стоп-лист»): спам или «не писать первым». */
  async blockPhone(raw: string, reason: BlockReason, byUserId: string, note: string | null) {
    const phone = normalizePhone(raw);
    if (phone.length < 10 || phone.length > 15) throw new MessageActionError("Номер телефона — 10–15 цифр");
    await this.blocklist.add([phone], byUserId, { reason, note });
    return phone;
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

  /** Убрать номер из стоп-листа (ошибочно отклонили как спам или клиент снова согласен на сообщения). */
  unblock(value: string) {
    return this.blocklist.remove([value]);
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

/** «Перезвоните мне»: столько рабочих минут на звонок. */
const CALLBACK_WORK_MIN = 15;

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
    /** График CRM: срок «перезвонить» — в рабочих минутах (ночная заявка — к началу смены, а не просрочена к утру). */
    private readonly schedule?: Pick<WorkSchedule, "addWorkMinutes">,
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
   * через 15 рабочих минут на ответственного сделки и уведомление — чтобы заявка не потерялась. Заявка в 23:00 — срок
   * 09:15, как у пропущенного звонка (tasks-d2), а не «просрочено» к началу смены.
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
    const now = this.clock.now();
    const dueAt = this.schedule ? await this.schedule.addWorkMinutes(now, CALLBACK_WORK_MIN) : new Date(now.getTime() + CALLBACK_WORK_MIN * 60_000);
    await this.tasks.create({ title: `Перезвонить ${who} — заявка с сайта`, kind: "call", dueAt, dealId: deal.id, clientId: deal.clientId, assigneeId });
    await this.notifier.notify(assigneeId, "deals.view", { kind: "task", title: `Перезвонить: ${who}`, body: input.comment?.slice(0, 160) || "Заявка на обратный звонок с сайта", link: `/admin/deals/${deal.id}` });
    this.live.notificationsChanged();
    return deal.id;
  }
}
