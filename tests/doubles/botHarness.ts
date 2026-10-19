import { DEFAULT_RULE_SENDING, defaultBotConfig, type RuleSendingPolicy, type BotConfig, type BotEvent, type BotMode, type BotState, type Conversation, type DealField, type InboundMessage, type PaymentFacts, type BotMaterial } from "@/modules/messaging/domain";
import { isWorkTime, nextWorkStart, type WorkHours } from "@/shared/domain/schedule";
import { MessagingService, QualifierBot, type BotCrm, type BotInvoices, type BotSellerModel, type BotStore, type ConversationRepository, type MessageRepository, type SalesGateway, type StaffLine, type AnsweredTasks } from "@/modules/messaging/application";

export const start = new Date("2026-10-01T06:00:00Z"); // 11:00 по Алматы, рабочее время

export const DEAL_FIELDS: DealField[] = [
  { key: "recipient", label: "Для кого", type: "text", options: [] },
  { key: "occasion", label: "Повод", type: "select", options: ["Годовщина", "День рождения", "Свадьба"] },
];
/** Образ помощницы («Айгерим, помощница менеджера Марата»): его проверяют прежние тесты; образ самого менеджера — tests/bot-persona.test.ts. */
export const BOT_CONFIG: BotConfig = {
  ...defaultBotConfig,
  sell: { ...defaultBotConfig.sell, speaksAs: "assistant" },
  questions: [
    { field: "recipient", text: { ru: "Для кого книга?", kk: "Кітап кімге?" } },
    { field: "occasion", text: { ru: "Повод?", kk: "Қандай мереке?" } },
  ],
};

export type Conv = Conversation & { unread: number; awaiting: Date | null; closed?: boolean; lastText?: string; lastAt?: Date; botState?: BotState | null; botDueAt?: Date | null; lastOutgoingAt?: Date | null };

/** Последний ответ человека не двигается назад (как greatest в DrizzleConversationRepository). */
const later = (prev: Date | null | undefined, at: Date) => (prev && prev > at ? prev : at);
export type Msg = {
  id: string;
  conv: string;
  dir: "in" | "out";
  text: string;
  type: string;
  at: Date;
  externalId: string | null;
  status: string;
  source?: string | null;
  internal?: boolean;
  authorId?: string | null;
  mediaUrl?: string | null;
  replyToId?: string | null;
  forwarded?: boolean;
  editedAt?: Date | null;
  deletedAt?: Date | null;
  transcript?: string | null;
};

export function setup(
  opts: {
    blocked?: boolean;
    bot?: BotMode;
    workTime?: boolean;
    config?: BotConfig;
    clients?: Record<string, string>;
    openDeal?: { id: string; assigneeId: string | null };
    clientOrders?: number;
    priorChat?: boolean;
    dealStage?: { firstStage: boolean; orderId?: string | null };
    /** Сколько по сделке уже оплачено (счета): предоплату бот не предлагает. */
    dealPaid?: number;
    noExternalId?: boolean;
    /** Модель AI-продажника: без неё — шаблоны. */
    seller?: BotSellerModel;
    invoices?: BotInvoices;
    /** Читатель файлов вложений: id сообщения → байты (для распознавания голосовых и фото). */
    mediaFiles?: (id: string) => { data: Uint8Array; mime: string } | null;
    /** У кого телефон WhatsApp; claimNewLead — что вернёт продажи (по умолчанию заявка новая, ничья). */
    phoneHolder?: { id: string; name: string } | null;
    claimNewLead?: (dealId: string, userId: string) => { claimed: boolean; previous: string | null };
    /** Делает сделку ответственного и «открытой» для подхвата. */
    assignee?: string | null;
    /** Что CRM знает об оплате (платежи, счета, заказы) — для AI. */
    payments?: PaymentFacts;
    /** Подборка материалов продажника (фото, видео, пример книги). */
    materials?: BotMaterial[];
    /** Номер WhatsApp магазина (его в сообщениях писать можно). */
    shopPhone?: string;
    /** Стоп-лист «Не писать первым»: номера, которые там уже есть. */
    noMarketing?: string[];
    /** Окно и суточный лимит сообщений от правил (по умолчанию 09:00–21:00 и 40). */
    ruleSending?: RuleSendingPolicy;
    /** Номера сотрудников и служебные сообщения им (напоминания о задачах). */
    staffLine?: StaffLine;
    /** Задачи «ответить», которые закрывает ответ клиенту. */
    answeredTasks?: AnsweredTasks;
    /** Настоящий график (по Алматы) вместо «всегда рабочее время» / «всегда нерабочее» (workTime). */
    hours?: WorkHours;
  } = {},
) {
  let now = start;
  const convs = new Map<string, Conv>();
  const msgs: Msg[] = [];
  const deals: { id: string; title: string; unsorted: boolean; fields: Record<string, unknown>; tags: string[] }[] = [];
  const sent: string[] = [];
  const sendOpts: { replyTo?: string | null; forwarded?: boolean }[] = [];
  const files: { name: string; kind: string; caption: string; forwarded: boolean; replyTo: string | null }[] = [];
  const edits: { externalId: string; text: string }[] = [];
  const revokes: string[] = [];
  const claims: { dealId: string; userId: string }[] = [];
  const notes: string[] = [];
  /** Те же заметки — с id сделки, в которую записаны. */
  const dealNotes: { dealId: string; text: string }[] = [];
  const tasks: { title: string; kind: string; assigneeId: string | null }[] = [];
  const events: (BotEvent & { conv: string })[] = [];
  let seq = 0;
  /** Стоп-лист: номер → отметка и примечание (spam — от opts.blocked: любой номер). */
  const blocklist = new Map<string, { reason: "spam" | "no_marketing"; note: string | null; by: string | null }>((opts.noMarketing ?? []).map((v) => [v, { reason: "no_marketing", note: null, by: "m1" }]));
  const settings = { mode: opts.bot ?? "off", workTime: opts.workTime ?? true, config: opts.config ?? BOT_CONFIG };
  const conversations: ConversationRepository = {
    linkClientByDeal: async () => {},
    findById: async (id) => convs.get(id) ?? null,
    findByChat: async (ch, chId, chat) => [...convs.values()].find((c) => c.channel === ch && c.channelId === chId && c.chatId === chat) ?? null,
    create: async (i) => {
      const c: Conv = { ...i, id: `c${++seq}`, dealId: null, assigneeId: null, botStep: null, unread: 0, awaiting: null };
      convs.set(c.id, c);
      return c;
    },
    updateContact: async (id, p) => Object.assign(convs.get(id)!, p),
    linkDeal: async (id, l) => Object.assign(convs.get(id)!, l),
    recordIncoming: async (id, text, at) => {
      const c = convs.get(id)!;
      c.unread++;
      c.awaiting ??= at;
      c.awaitingSince = c.awaiting;
      c.lastText = text;
    },
    dismissAwaiting: async (id, since) => {
      const c = convs.get(id)!;
      if (!c.awaiting || c.awaiting.getTime() !== since.getTime()) return false;
      Object.assign(c, { awaiting: null, awaitingSince: null });
      return true;
    },
    recordEcho: async (id, text, at) => {
      const c = convs.get(id)!;
      Object.assign(c, { unread: 0, awaiting: null, awaitingSince: null, lastText: text, lastOutgoingAt: later(c.lastOutgoingAt, at) });
    },
    recordHistory: async (id, text, at) => {
      const c = convs.get(id)!;
      if (!c.lastAt || c.lastAt < at) Object.assign(c, { lastText: text, lastAt: at });
    },
    recordOutgoing: async (id, text, at, author) => {
      const c = convs.get(id)!;
      Object.assign(c, { lastText: text });
      if (author) Object.assign(c, { unread: 0, awaiting: null, awaitingSince: null, lastOutgoingAt: later(c.lastOutgoingAt, at) });
    },
    closeAsSpam: async (id) => void Object.assign(convs.get(id)!, { closed: true }),
    markRead: async (id) => void Object.assign(convs.get(id)!, { unread: 0 }),
    advanceBot: async (id, from, to) => {
      const c = convs.get(id)!;
      if (c.botStep !== from) return false;
      c.botStep = to;
      return true;
    },
    latestWhatsapp: async (chatId) => [...convs.values()].filter((c) => c.channel === "whatsapp" && c.chatId === chatId).at(-1) ?? null,
    assignByDeal: async () => {},
    chatIdsByDeal: async (dealId) => [...convs.values()].filter((c) => c.dealId === dealId).map((c) => c.chatId),
    chatIdsByClient: async (clientId) => [...convs.values()].filter((c) => c.clientId === clientId).map((c) => c.chatId),
    closeByDeal: async () => {},
    setAssignee: async () => {},
    setStatus: async () => {},
  };
  const messages: MessageRepository = {
    insertIncoming: async (conv, m) => (msgs.some((x) => x.externalId === m.externalId) ? false : !!msgs.push({ id: `m${++seq}`, conv, dir: "in", text: m.text, type: m.type, at: m.at, externalId: m.externalId, status: "received", mediaUrl: m.mediaUrl })),
    existsExternal: async (e) => msgs.some((x) => x.externalId === e),
    knownExternal: async (ids) => new Set(ids.filter((e) => msgs.some((x) => x.externalId === e))),
    claimPendingEcho: async (conv, text, _s, ext) => {
      const own = msgs.find((x) => x.conv === conv && x.dir === "out" && !x.internal && (x.source === "bot" || x.source === "rule") && x.text === text);
      if (own) return true;
      const p = msgs.find((x) => x.conv === conv && x.dir === "out" && !x.externalId && x.text === text);
      if (p) p.externalId = ext;
      return !!p;
    },
    insertEcho: async (conv, m) => !!msgs.push({ id: `m${++seq}`, conv, dir: "out", text: m.text, type: m.type, at: m.at, externalId: m.externalId, status: "sent" }),
    insertOutgoing: async (conv, text, authorId, internal, source, extra = {}) => {
      const m: Msg = { id: `m${++seq}`, conv, dir: "out", text, type: extra.type ?? "text", at: now, externalId: null, status: "pending", source: source ?? null, internal: !!internal, authorId, mediaUrl: extra.mediaUrl ?? null, replyToId: extra.replyToId ?? null, forwarded: !!extra.forwarded };
      msgs.push(m);
      return { id: m.id, conversationId: conv, text, authorId, createdAt: now };
    },
    setStatus: async (id, status) => void (msgs.find((m) => m.id === id)!.status = status),
    findOne: async (id) => {
      const m = msgs.find((x) => x.id === id);
      return m
        ? { id: m.id, conversationId: m.conv, direction: m.dir, type: m.type, text: m.text, mediaUrl: m.mediaUrl ?? null, externalId: m.externalId, internal: !!m.internal, authorId: m.authorId ?? null, source: (m.source as "bot" | "rule" | null) ?? null, status: m.status, deletedAt: m.deletedAt ?? null, transcript: m.transcript ?? null, createdAt: m.at }
        : null;
    },
    editText: async (id, text, at) => void Object.assign(msgs.find((m) => m.id === id)!, { text, editedAt: at }),
    markDeleted: async (id, at) => void Object.assign(msgs.find((m) => m.id === id)!, { deletedAt: at }),
    setTranscript: async (id, text) => void Object.assign(msgs.find((m) => m.id === id)!, { transcript: text }),
    attachExternalId: async (id, ext) => void Object.assign(msgs.find((m) => m.id === id)!, { externalId: ext, status: "sent" }),
    byExternalId: async (e) => {
      const m = msgs.find((x) => x.externalId === e);
      return m ? { id: m.id, status: m.status, conversationId: m.conv } : null;
    },
    countRuleSince: async (since, cap) => Math.min(cap, msgs.filter((m) => m.source === "rule" && !m.internal && m.at >= since).length),
  };
  const sales: SalesGateway = {
    findClientByPhone: async (phone) => opts.clients?.[phone] ?? null,
    findOpenDeal: async () => (opts.openDeal ? { ...opts.openDeal, clientId: null, utm: null } : null),
    createDeal: async (i) => {
      const d = { id: `d${++seq}`, title: i.title, unsorted: i.unsorted, fields: {}, tags: [] };
      deals.push(d);
      return { id: d.id, assigneeId: null, clientId: i.clientId };
    },
    setUtmIfEmpty: async () => {},
    acceptUnsorted: async (dealId) => void (deals.find((d) => d.id === dealId) && (deals.find((d) => d.id === dealId)!.unsorted = false)),
    note: async (d, text) => void (notes.push(text), dealNotes.push({ dealId: d.id, text })),
    setField: async (dealId, k, v) => void (deals.find((d) => d.id === dealId)!.fields[k] = v),
    deal: async (id) => {
      const d = deals.find((x) => x.id === id) ?? (opts.openDeal?.id === id ? { id, title: "Сделка", fields: {} } : null);
      return d ? { id: d.id, clientId: null, assigneeId: null, title: d.title, contactName: "", customFields: d.fields } : null;
    },
    nextRoundRobin: async () => null,
    claimNewLead: async (dealId: string, userId: string) => (claims.push({ dealId, userId }), opts.claimNewLead ? opts.claimNewLead(dealId, userId) : { claimed: true, previous: null }),
  };
  const store: BotStore = {
    load: async (id) => {
      const c = convs.get(id);
      return c ? { botStep: c.botStep, state: c.botState ? structuredClone(c.botState) : null, dueAt: c.botDueAt ?? null } : null;
    },
    save: async (id, expected, next, o) => {
      const c = convs.get(id)!;
      if (expected === null ? c.botState != null : (c.botState?.version ?? 0) !== expected) return false;
      if (!o?.restart && c.botStep === -1) return false;
      Object.assign(c, { botStep: next.botStep, botState: structuredClone(next.state), botDueAt: next.dueAt });
      return true;
    },
    setDue: async (id, dueAt) => {
      const c = convs.get(id)!;
      if (c.botStep !== -1 && c.botState && c.botState.phase !== "done") c.botDueAt = dueAt;
    },
    stop: async (id, reason, o) => {
      const c = convs.get(id)!;
      if (c.botStep === -1) return false;
      const active = !!c.botState && c.botState.phase !== "done";
      Object.assign(c, { ...(o?.soft ? {} : { botStep: -1 }), botDueAt: null });
      if (active) c.botState = { ...c.botState!, phase: "done", outcome: "stopped_by_manager", reason, asking: null, version: c.botState!.version + 1 };
      return active;
    },
    due: async (at) => [...convs.values()].filter((c) => c.botDueAt && c.botDueAt < at && c.botStep !== -1).map((c) => c.id),
    incoming: async (id, since) => msgs.filter((m) => m.conv === id && m.dir === "in" && m.at >= since).map((m) => ({ id: m.id, text: m.text, type: m.type, at: m.at, mediaUrl: m.mediaUrl })),
    log: async (id, _deal, _lang, list) => void events.push(...list.map((e) => ({ ...e, conv: id }))),
  };
  const crm: BotCrm = {
    deal: async (id) => {
      const d = await sales.deal(id);
      return d && { orderId: opts.dealStage?.orderId ?? null, paid: opts.dealPaid ?? 0, firstStage: opts.dealStage?.firstStage ?? true, closed: false, assigneeId: d.assigneeId, unsorted: true, customFields: d.customFields, contactName: d.contactName, title: d.title, clientId: d.clientId };
    },
    client: async () => ({ orders: opts.clientOrders ?? 0, books: 0, locale: null, name: null }),
    tag: async (dealId, tag) => void deals.find((d) => d.id === dealId)?.tags.push(tag),
    priorChat: async () => !!opts.priorChat,
    ...(opts.payments ? { payments: async () => opts.payments! } : {}),
  };
  const quiet = { info: () => {}, warn: () => {}, error: () => {} };
  const notified: { title: string; kind: string }[] = [];
  /** Уведомления руководителям (реквизиты с телефона компании, правило с реквизитами): заголовок и текст. */
  const alerts: { title: string; body: string }[] = [];
  const notifier = { notify: async (_to: unknown, _p: unknown, n: { title: string; kind: string }) => void notified.push({ title: n.title, kind: n.kind }), managers: async (n: { title: string; body: string }) => void alerts.push({ title: n.title, body: n.body }) };
  const clock = { now: () => now };
  const scheduled: string[] = [];
  /** Диалоги, о которых сервис сообщил открытым вкладкам CRM (live.chatChanged), по порядку. */
  const changed: string[] = [];
  const triage = new Map<string, { at: Date; run: () => void }>();
  const service: MessagingService = new MessagingService(
    conversations,
    messages,
    {
      isBlocked: async (...v) => !!opts.blocked || v.some((x) => !!x && blocklist.get(x)?.reason === "spam"),
      noMarketing: async (...v) => !!opts.blocked || v.some((x) => !!x && blocklist.has(x)),
      add: async (values, by, o = {}) => {
        for (const v of values) {
          const had = blocklist.get(v);
          if (!had || (o.reason ?? "spam") === "spam") blocklist.set(v, { reason: o.reason ?? "spam", note: o.note ?? had?.note ?? null, by: had?.by ?? by });
        }
      },
      remove: async (values, reason) => values.forEach((v) => (!reason || blocklist.get(v)?.reason === reason) && blocklist.delete(v)),
    },
    {
      send: async (_c, _id, text, o) => (sent.push(text), sendOpts.push(o ?? {}), { ok: true, externalId: opts.noExternalId ? null : `wz-${sent.length}` }),
      sendFile: async (_c, file, o) => (files.push({ name: file.name, kind: file.kind, caption: o.caption, forwarded: !!o.forwarded, replyTo: o.replyTo ?? null }), { ok: true, externalId: `wzf-${files.length}` }),
      edit: async (_c, externalId, text) => (edits.push({ externalId, text }), { ok: true }),
      revoke: async (_c, externalId) => (revokes.push(externalId), { ok: true }),
    },
    sales,
    { fromText: async () => null },
    notifier,
    { chatChanged: (id) => void changed.push(id), notificationsChanged: () => {} },
    { messageIncoming: async () => {} },
    { onIncoming: (...a) => bot.onIncoming(...a), stopByHuman: (...a) => bot.stopByHuman(...a), isActive: (id) => bot.isActive(id) },
    clock,
    quiet,
    async () => opts.shopPhone ?? "",
    async () => opts.phoneHolder ?? null,
    async () => opts.ruleSending ?? DEFAULT_RULE_SENDING,
    opts.staffLine ?? null,
    opts.answeredTasks ?? null,
  );
  const deps = {
    conversations,
    store,
    settings: {
      mode: async () => settings.mode,
      config: async () => settings.config,
      isWorkTime: async (at: Date) => (opts.hours ? isWorkTime(at, opts.hours, "Asia/Almaty") : settings.workTime),
      nextWorkStart: async (at: Date) => (opts.hours ? nextWorkStart(at, opts.hours, "Asia/Almaty") : settings.workTime ? now : new Date("2026-10-02T04:00:00Z")),
      dealFields: async () => DEAL_FIELDS,
      catalog: async () => ({ plans: [{ id: "hardcover", price: 30000 }], delivery: [], addons: [], productionDays: { standard: "5–7", premium: "3–4" } }),
      site: async () => ({ url: "https://mybook.kz", registrationOpen: false, themes: ["love", "mom", "dad", "friend"], landings: [] }),
      timeZone: () => "Asia/Almaty",
      knowledge: async () => "",
      brand: () => "MyBooks",
    },
    crm,
    sales,
    notifier,
    tasks: { create: async (t: { title: string; kind: string; assigneeId: string | null }) => void tasks.push(t) },
    // Ходы бота делает sweep (как планировщик); таймеры «нужен ли ответ» (triage) — только в процессе, их запускает advance.
    timers: {
      schedule: (key: string, at: Date, run: () => void) => {
        scheduled.push(key);
        if (key.startsWith("triage:")) triage.set(key, { at, run });
      },
    },
    clock,
    logger: quiet,
    send: (id: string, text: string) => service.send(id, text, null, "bot"),
    note: (id: string, text: string) => service.addInternalNote(id, text, null, "bot"),
    shopPhone: async () => "77000000000",
    seller: opts.seller ?? null,
    invoices: opts.invoices ?? null,
    media: opts.mediaFiles ? async (id: string) => opts.mediaFiles!(id) : null,
    transcript: async (id: string, text: string) => void Object.assign(msgs.find((m) => m.id === id) ?? {}, { transcript: text }),
    noMarketing: (c: Conversation) => service.noMarketing(c.chatId, c.meta.phone),
    materials: opts.materials
      ? { list: async () => opts.materials!, send: (id: string, m: BotMaterial) => service.sendBotFile(id, { data: new Uint8Array([1]), name: m.name, mime: m.mime, kind: m.kind }, m.caption, `store:${m.key}`) }
      : null,
    history: async (id: string) =>
      msgs
        .filter((m) => m.conv === id && !m.internal)
        .map((m) => ({
          from: m.dir === "in" ? ("client" as const) : m.source === "bot" ? ("bot" as const) : ("manager" as const),
          text: m.type === "audio" ? (m.transcript ? `[Голосовое клиента: ${m.transcript}]` : "[голосовое сообщение]") : m.text,
          at: m.at,
          author: m.dir === "out" && m.source !== "bot" ? "Margo" : null,
          id: m.id,
          type: m.type,
        })),
  };
  const bot = new QualifierBot(deps);
  /** Время идёт: планировщик делает просроченные ходы (так же, как таймер в процессе). */
  const advance = async (ms: number) => {
    now = new Date(now.getTime() + ms);
    await bot.sweep();
    for (const [key, t] of [...triage]) {
      if (t.at.getTime() > now.getTime()) continue;
      triage.delete(key);
      t.run();
      // Проверка асинхронная: даём ей закончиться до следующего шага теста.
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    }
  };
  return { service, bot, deps, blocklist, convs, msgs, deals, sent, sendOpts, files, edits, revokes, claims, notes, dealNotes, notified, alerts, tasks, events, settings, advance, scheduled, changed, setNow: (d: Date) => (now = d), conv: () => [...convs.values()][0] };
}

let ext = 0;
export const inbound = (p: Partial<InboundMessage> = {}): InboundMessage => ({ externalId: `e${++ext}`, channelId: "ch", chatType: "whatsapp", chatId: "77011234567", at: start, isEcho: false, type: "text", text: "Здравствуйте", mediaUrl: null, contactName: "Айгерим", avatarUrl: null, status: null, ...p });

