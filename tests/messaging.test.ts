import { describe, expect, it } from "vitest";
import { answerValue, botSummary, contactChanges, contactPhone, defaultBotConfig, preview, redactSecrets, shouldApplyStatus, type BotConfig, type BotEvent, type BotMode, type BotState, type Conversation, type DealField, type InboundMessage } from "@/modules/messaging/domain";
import { BOT_ABANDON_MS, BOT_PAUSE_MS, MessagingService, QualifierBot, type BotCrm, type BotStore, type ConversationRepository, type MessageRepository, type SalesGateway } from "@/modules/messaging/application";

const start = new Date("2026-10-01T06:00:00Z"); // 11:00 по Алматы, рабочее время

describe("домен переписки", () => {
  it("телефон собеседника — из WhatsApp-идентификатора или оставленный на сайте", () => {
    expect(contactPhone({ chatId: "87011234567", meta: {} })).toBe("77011234567");
    expect(contactPhone({ chatId: "v_abc", meta: { phone: "+7 701 765 43 21" } })).toBe("77017654321");
    expect(contactPhone({ chatId: "insta_login", meta: {} })).toBeNull();
  });

  it("статусы доставки не откатываются назад, ошибка применяется всегда", () => {
    expect(shouldApplyStatus("sent", "delivered")).toBe(true);
    expect(shouldApplyStatus("read", "delivered")).toBe(false);
    expect(shouldApplyStatus("read", "error")).toBe(true);
  });

  it("эхо с телефона не переименовывает контакт", () => {
    const c = { id: "c", channel: "whatsapp", channelId: "ch", chatId: "77011234567", contactName: "Айгерим", avatarUrl: null, clientId: null, dealId: null, assigneeId: null, botStep: null, meta: {} } satisfies Conversation;
    expect(contactChanges(c, { contactName: "Менеджер", avatarUrl: null, isEcho: true }, {})).toBeNull();
    expect(contactChanges(c, { contactName: "Айгерим Б.", avatarUrl: null, isEcho: false }, {})?.contactName).toBe("Айгерим Б.");
  });

  it("ответ → значение поля: вариант из списка, число, текст", () => {
    expect(answerValue("электронная", { key: "format", label: "Формат", type: "select", options: ["Печатная", "Электронная"] })).toBe("Электронная");
    expect(answerValue("2,5", { key: "n", label: "N", type: "number", options: [] })).toBe(2.5);
    expect(answerValue("бюджет 30 000", { key: "n", label: "N", type: "number", options: [] })).toBe(30000);
    expect(answerValue("  для мамы ", undefined)).toBe("для мамы");
  });
});

// ─── инбокс и бот на двойниках ─────────────────────────────────────────────

const DEAL_FIELDS: DealField[] = [
  { key: "recipient", label: "Для кого", type: "text", options: [] },
  { key: "occasion", label: "Повод", type: "select", options: ["Годовщина", "День рождения", "Свадьба"] },
];
const BOT_CONFIG: BotConfig = {
  ...defaultBotConfig,
  questions: [
    { field: "recipient", text: { ru: "Для кого книга?", kk: "Кітап кімге?" } },
    { field: "occasion", text: { ru: "Повод?", kk: "Қандай мереке?" } },
  ],
};

type Conv = Conversation & { unread: number; awaiting: Date | null; closed?: boolean; lastText?: string; lastAt?: Date; botState?: BotState | null; botDueAt?: Date | null };
type Msg = { id: string; conv: string; dir: "in" | "out"; text: string; type: string; at: Date; externalId: string | null; status: string; source?: string | null; internal?: boolean; authorId?: string | null };

function setup(
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
    noExternalId?: boolean;
  } = {},
) {
  let now = start;
  const convs = new Map<string, Conv>();
  const msgs: Msg[] = [];
  const deals: { id: string; title: string; unsorted: boolean; fields: Record<string, unknown>; tags: string[] }[] = [];
  const sent: string[] = [];
  const notes: string[] = [];
  const tasks: { title: string; kind: string; assigneeId: string | null }[] = [];
  const events: (BotEvent & { conv: string })[] = [];
  let seq = 0;
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
      c.lastText = text;
    },
    recordEcho: async (id, text) => void Object.assign(convs.get(id)!, { unread: 0, awaiting: null, lastText: text }),
    recordHistory: async (id, text, at) => {
      const c = convs.get(id)!;
      if (!c.lastAt || c.lastAt < at) Object.assign(c, { lastText: text, lastAt: at });
    },
    recordOutgoing: async (id, text, _at, author) => {
      Object.assign(convs.get(id)!, { lastText: text });
      if (author) Object.assign(convs.get(id)!, { unread: 0, awaiting: null, botStep: -1 });
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
    chatIdsByDeal: async () => [],
    closeByDeal: async () => {},
    setAssignee: async () => {},
    setStatus: async () => {},
  };
  const messages: MessageRepository = {
    insertIncoming: async (conv, m) => (msgs.some((x) => x.externalId === m.externalId) ? false : !!msgs.push({ id: `m${++seq}`, conv, dir: "in", text: m.text, type: m.type, at: m.at, externalId: m.externalId, status: "received" })),
    existsExternal: async (e) => msgs.some((x) => x.externalId === e),
    claimPendingEcho: async (conv, text, _s, ext) => {
      const own = msgs.find((x) => x.conv === conv && x.dir === "out" && !x.internal && (x.source === "bot" || x.source === "rule") && x.text === text);
      if (own) return true;
      const p = msgs.find((x) => x.conv === conv && x.dir === "out" && !x.externalId && x.text === text);
      if (p) p.externalId = ext;
      return !!p;
    },
    insertEcho: async (conv, m) => !!msgs.push({ id: `m${++seq}`, conv, dir: "out", text: m.text, type: m.type, at: m.at, externalId: m.externalId, status: "sent" }),
    insertOutgoing: async (conv, text, authorId, internal, source) => {
      const m: Msg = { id: `m${++seq}`, conv, dir: "out", text, type: "text", at: now, externalId: null, status: "pending", source: source ?? null, internal: !!internal, authorId };
      msgs.push(m);
      return { id: m.id, conversationId: conv, text, authorId, createdAt: now };
    },
    setStatus: async (id, status) => void (msgs.find((m) => m.id === id)!.status = status),
    attachExternalId: async (id, ext) => void Object.assign(msgs.find((m) => m.id === id)!, { externalId: ext, status: "sent" }),
    byExternalId: async (e) => {
      const m = msgs.find((x) => x.externalId === e);
      return m ? { id: m.id, status: m.status, conversationId: m.conv } : null;
    },
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
    note: async (_d, text) => void notes.push(text),
    setField: async (dealId, k, v) => void (deals.find((d) => d.id === dealId)!.fields[k] = v),
    deal: async (id) => {
      const d = deals.find((x) => x.id === id) ?? (opts.openDeal?.id === id ? { id, title: "Сделка", fields: {} } : null);
      return d ? { id: d.id, clientId: null, assigneeId: null, title: d.title, contactName: "", customFields: d.fields } : null;
    },
    nextRoundRobin: async () => null,
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
    stop: async (id, reason) => {
      const c = convs.get(id)!;
      if (c.botStep === -1) return false;
      const active = !!c.botState && c.botState.phase !== "done";
      Object.assign(c, { botStep: -1, botDueAt: null });
      if (active) c.botState = { ...c.botState!, phase: "done", outcome: "stopped_by_manager", reason, asking: null, version: c.botState!.version + 1 };
      return active;
    },
    due: async (at) => [...convs.values()].filter((c) => c.botDueAt && c.botDueAt < at && c.botStep !== -1).map((c) => c.id),
    incoming: async (id, since) => msgs.filter((m) => m.conv === id && m.dir === "in" && m.at >= since).map((m) => ({ id: m.id, text: m.text, type: m.type, at: m.at })),
    log: async (id, _deal, _lang, list) => void events.push(...list.map((e) => ({ ...e, conv: id }))),
  };
  const crm: BotCrm = {
    deal: async (id) => {
      const d = await sales.deal(id);
      return d && { orderId: opts.dealStage?.orderId ?? null, firstStage: opts.dealStage?.firstStage ?? true, closed: false, assigneeId: d.assigneeId, unsorted: true, customFields: d.customFields, contactName: d.contactName, title: d.title, clientId: d.clientId };
    },
    client: async () => ({ orders: opts.clientOrders ?? 0, books: 0, locale: null, name: null }),
    tag: async (dealId, tag) => void deals.find((d) => d.id === dealId)?.tags.push(tag),
    priorChat: async () => !!opts.priorChat,
  };
  const quiet = { info: () => {}, warn: () => {}, error: () => {} };
  const notified: { title: string; kind: string }[] = [];
  const notifier = { notify: async (_to: unknown, _p: unknown, n: { title: string; kind: string }) => void notified.push({ title: n.title, kind: n.kind }) };
  const clock = { now: () => now };
  const scheduled: string[] = [];
  const service: MessagingService = new MessagingService(
    conversations,
    messages,
    { isBlocked: async () => !!opts.blocked, add: async () => {}, remove: async () => {} },
    { send: async (_c, _id, text) => (sent.push(text), { ok: true, externalId: opts.noExternalId ? null : `wz-${sent.length}` }) },
    sales,
    { fromText: async () => null },
    notifier,
    { chatChanged: () => {}, notificationsChanged: () => {} },
    { messageIncoming: async () => {} },
    { onIncoming: (...a) => bot.onIncoming(...a), stopByHuman: (...a) => bot.stopByHuman(...a), isActive: (id) => bot.isActive(id) },
    clock,
    quiet,
  );
  const deps = {
    conversations,
    store,
    settings: {
      mode: async () => settings.mode,
      config: async () => settings.config,
      isWorkTime: async () => settings.workTime,
      nextWorkStart: async () => (settings.workTime ? now : new Date("2026-10-02T04:00:00Z")),
      dealFields: async () => DEAL_FIELDS,
      catalog: async () => ({ plans: [{ id: "hardcover", price: 30000 }], delivery: [], addons: [], productionDays: { standard: "5–7", premium: "3–4" } }),
      site: async () => ({ url: "https://mybook.kz", registrationOpen: false, themes: ["love", "mom", "dad", "friend"], landings: [] }),
      timeZone: () => "Asia/Almaty",
    },
    crm,
    sales,
    notifier,
    tasks: { create: async (t: { title: string; kind: string; assigneeId: string | null }) => void tasks.push(t) },
    timers: { schedule: (key: string) => void scheduled.push(key) },
    clock,
    logger: quiet,
    send: (id: string, text: string) => service.send(id, text, null, "bot"),
    note: (id: string, text: string) => service.addInternalNote(id, text, null, "bot"),
    shopPhone: async () => "77000000000",
  };
  const bot = new QualifierBot(deps);
  /** Время идёт: планировщик делает просроченные ходы (так же, как таймер в процессе). */
  const advance = async (ms: number) => {
    now = new Date(now.getTime() + ms);
    await bot.sweep();
  };
  return { service, bot, deps, convs, msgs, deals, sent, notes, notified, tasks, events, settings, advance, scheduled, setNow: (d: Date) => (now = d), conv: () => [...convs.values()][0] };
}

let ext = 0;
const inbound = (p: Partial<InboundMessage> = {}): InboundMessage => ({ externalId: `e${++ext}`, channelId: "ch", chatType: "whatsapp", chatId: "77011234567", at: start, isEcho: false, type: "text", text: "Здравствуйте", mediaUrl: null, contactName: "Айгерим", avatarUrl: null, status: null, ...p });

describe("MessagingService", () => {
  it("новое обращение: диалог, заявка в «Неразобранном», «ждёт ответа»; повтор вебхука не дублирует", async () => {
    const { service, convs, deals, msgs } = setup();
    const m = inbound();
    await service.ingest(m);
    await service.ingest(m);
    const [c] = [...convs.values()];
    expect(deals).toEqual([expect.objectContaining({ title: "Заявка из WhatsApp: Айгерим", unsorted: true })]);
    expect(c).toMatchObject({ dealId: deals[0].id, unread: 1, awaiting: start });
    expect(msgs).toHaveLength(1);
  });

  it("ответ менеджера принимает заявку и снимает «ждёт ответа»; эхо этого ответа не дублируется", async () => {
    const { service, convs, deals, msgs } = setup();
    await service.ingest(inbound());
    const [c] = [...convs.values()];
    await service.send(c.id, "Добрый день!", "m1");
    expect(c).toMatchObject({ unread: 0, awaiting: null });
    expect(deals[0].unsorted).toBe(false);
    await service.ingest(inbound({ externalId: "wz-1", isEcho: true, text: "Добрый день!" }));
    expect(msgs.filter((m) => m.dir === "out")).toHaveLength(1);
  });

  it("переход с Wazzup на свой шлюз: переписка с номером продолжается в прежнем диалоге", async () => {
    const { service, convs, deals } = setup();
    await service.ingest(inbound({ channelId: "wazzup-channel" }));
    await service.ingest(inbound({ externalId: "gowa-1", channelId: "gowa", text: "Это снова я" }), { anyWhatsappChannel: true });
    expect(convs.size).toBe(1);
    expect(deals).toHaveLength(1);
    expect([...convs.values()][0]).toMatchObject({ channelId: "wazzup-channel", unread: 2 });
    await service.ingest(inbound({ externalId: "x-1", channelId: "other" }));
    expect(convs.size).toBe(2);
  });

  it("спам: сообщение сохранено, заявки нет, диалог закрыт", async () => {
    const { service, convs, deals } = setup({ blocked: true });
    await service.ingest(inbound());
    expect(deals).toHaveLength(0);
    expect([...convs.values()][0].closed).toBe(true);
  });
});

describe("бот в инбоксе", () => {
  it("опрос целиком: пауза, одно сообщение на ход, ответы в поля, итог заметкой в сделке и чате, два уведомления вместо шести", async () => {
    const t = setup({ bot: "always" });
    await t.service.ingest(inbound({ text: "Здравствуйте! Хочу узнать стоимость." }));
    expect(t.sent).toEqual([]); // бот ждёт паузу в сообщениях
    expect(t.conv().botDueAt).toEqual(new Date(start.getTime() + BOT_PAUSE_MS));
    await t.advance(BOT_PAUSE_MS + 1);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]).toContain("Здравствуйте, Айгерим!");
    expect(t.sent[0]).toContain("Стоимость зависит от формата");
    expect(t.sent[0]).toContain("Для кого книга?");
    await t.service.ingest(inbound({ text: "для мамы" }));
    await t.advance(BOT_PAUSE_MS + 1);
    expect(t.sent[1]).toContain("Повод?");
    await t.service.ingest(inbound({ text: "др" }));
    await t.advance(BOT_PAUSE_MS + 1);
    expect(t.sent[2]).toBe("Спасибо! Передала ваши ответы менеджеру — он скоро напишет 🙌");
    expect(t.deals[0].fields).toEqual({ recipient: "Маме", occasion: "День рождения" });
    expect(t.deals[0].tags).toEqual(["тема: Маме"]);
    expect(t.notes[0]).toContain("Для кого: Маме (тема «Маме»)");
    const internal = t.msgs.filter((m) => m.internal);
    expect(internal).toEqual([expect.objectContaining({ source: "bot", authorId: null })]);
    expect(t.msgs.filter((m) => m.dir === "out" && !m.internal).every((m) => m.source === "bot")).toBe(true);
    // Уведомления: первое сообщение и итог бота; ответы клиента во время опроса — без отдельных уведомлений.
    expect(t.notified.map((n) => n.title)).toEqual(["Айгерим · WhatsApp", "Бот собрал ответы: Айгерим"]);
    expect(t.conv().botStep).toBe(-1);
    expect(t.events.map((e) => e.kind)).toEqual(["started", "faq", "answer", "answer", "finished"]);
  });

  it("два сообщения подряд — один ответ: всё, что клиент написал за паузу, разбирается вместе", async () => {
    const t = setup({ bot: "always" });
    await t.service.ingest(inbound({ text: "Здравствуйте" }));
    await t.advance(3000);
    await t.service.ingest(inbound({ text: "хочу книгу маме" }));
    await t.advance(3000);
    await t.service.ingest(inbound({ text: "на день рождения" }));
    expect(t.sent).toEqual([]);
    await t.advance(BOT_PAUSE_MS + 1);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]).toContain("Поняла: маме, день рождения.");
    expect(t.deals[0].fields).toEqual({ recipient: "Маме", occasion: "День рождения" });
  });

  it("повторная доставка вебхука посреди опроса — второго ответа нет", async () => {
    const t = setup({ bot: "always" });
    await t.service.ingest(inbound());
    await t.advance(BOT_PAUSE_MS + 1);
    const answer = inbound({ text: "для мужа" });
    await t.service.ingest(answer);
    await t.service.ingest(answer);
    await t.advance(BOT_PAUSE_MS + 1);
    await t.advance(BOT_PAUSE_MS + 1);
    expect(t.sent).toHaveLength(2);
    expect(t.events.filter((e) => e.kind === "answer")).toHaveLength(1);
  });

  it("менеджер ответил с телефона посреди опроса — бот замолкает навсегда (случай «Ау» / «Это бот»)", async () => {
    const t = setup({ bot: "always" });
    await t.service.ingest(inbound({ text: "Здравствуйте" }));
    await t.advance(BOT_PAUSE_MS + 1);
    await t.service.ingest(inbound({ isEcho: true, externalId: "phone-1", text: "Ау" }));
    await t.service.ingest(inbound({ isEcho: true, externalId: "phone-2", text: "Это бот" }));
    await t.service.ingest(inbound({ text: "для мамы" }));
    await t.advance(BOT_PAUSE_MS + 1);
    await t.advance(BOT_ABANDON_MS + 1);
    expect(t.sent).toHaveLength(1);
    expect(t.conv()).toMatchObject({ botStep: -1, botState: expect.objectContaining({ outcome: "stopped_by_manager", reason: "phone" }) });
    expect(t.events.filter((e) => e.kind === "stopped_by_manager")).toHaveLength(1);
    // Поле «для кого» из ответа менеджеру не перехватывается ботом.
    expect(t.deals[0].fields).toEqual({});
    // Бот больше не ведёт диалог — уведомления о сообщениях клиента снова приходят.
    expect(t.notified.at(-1)?.title).toBe("Айгерим · WhatsApp");
  });

  it("менеджер ответил с телефона во время паузы — бот так и не пишет", async () => {
    const t = setup({ bot: "always" });
    await t.service.ingest(inbound({ text: "Добрый день" }));
    await t.service.ingest(inbound({ isEcho: true, externalId: "phone-1", text: "Здравствуйте! Я ваш личный менеджер" }));
    await t.advance(BOT_PAUSE_MS + 1);
    expect(t.sent).toEqual([]);
    expect(t.conv().botStep).toBe(-1);
  });

  it("ответ менеджера из CRM тоже останавливает бота; копия сообщения бота с другим ID — нет", async () => {
    const t = setup({ bot: "always" });
    await t.service.ingest(inbound());
    await t.advance(BOT_PAUSE_MS + 1);
    // Шлюз прислал копию сообщения бота с другим ID — это не ответ человека.
    await t.service.ingest(inbound({ isEcho: true, externalId: "gw-copy", text: t.sent[0] }));
    expect(t.conv().botStep).toBe(0);
    await t.service.send(t.conv().id, "Здравствуйте, я менеджер", "manager-1");
    expect(t.conv().botState).toMatchObject({ outcome: "stopped_by_manager", reason: "crm" });
    await t.service.ingest(inbound({ text: "для мамы" }));
    await t.advance(BOT_PAUSE_MS + 1);
    expect(t.sent).toHaveLength(2); // приветствие бота и ответ менеджера
  });

  it("гонка: два процесса делают ход одновременно — клиент получает один ответ", async () => {
    const t = setup({ bot: "always" });
    await t.service.ingest(inbound());
    t.setNow(new Date(start.getTime() + BOT_PAUSE_MS + 1));
    const other = new QualifierBot(t.deps);
    await Promise.all([t.bot.process(t.conv().id), other.process(t.conv().id)]);
    expect(t.sent).toHaveLength(1);
  });

  it("fallback: в рабочее время бот ждёт менеджера; ответил — бот молчит, не ответил за N минут — бот начинает", async () => {
    const answered = setup({ bot: "fallback" });
    await answered.service.ingest(inbound());
    await answered.advance(60_000);
    expect(answered.sent).toEqual([]);
    await answered.service.ingest(inbound({ isEcho: true, externalId: "phone-1", text: "Добрый день!" }));
    await answered.advance(5 * 60_000);
    expect(answered.sent).toEqual([]);

    const silent = setup({ bot: "fallback" });
    await silent.service.ingest(inbound());
    await silent.advance(2 * 60_000);
    expect(silent.sent).toEqual([]);
    await silent.advance(60_000 + 1);
    expect(silent.sent).toHaveLength(1);
    // Ночью — без ожидания, после короткой паузы.
    const night = setup({ bot: "fallback", workTime: false });
    await night.service.ingest(inbound());
    await night.advance(BOT_PAUSE_MS + 1);
    expect(night.sent[0]).toContain("Для кого книга?");
  });

  it("«только вне рабочего времени» днём — бот не начинает (в журнале причина)", async () => {
    const t = setup({ bot: "off_hours", workTime: true });
    await t.service.ingest(inbound());
    await t.advance(BOT_PAUSE_MS + 1);
    expect(t.sent).toEqual([]);
    expect(t.events).toEqual([expect.objectContaining({ kind: "skipped", reason: "work_time" })]);
  });

  it("не новый клиент — без опроса: заказ, переписка до CRM, «Маме» первым сообщением, почта", async () => {
    for (const [o, msg, reason] of [
      [{ clientOrders: 1, clients: { "77011234567": "client-1" } }, inbound(), "client_has_order"],
      [{ priorChat: true }, inbound(), "prior_chat"],
      [{}, inbound({ text: "Маме" }), "continuation"],
      [{}, inbound({ chatType: "email", chatId: "a@b.kz", text: "Здравствуйте" }), "channel"],
      [{ openDeal: { id: "deal-9", assigneeId: "m1" }, dealStage: { firstStage: false } }, inbound(), "deal_in_work"],
    ] as const) {
      const t = setup({ bot: "always", ...o });
      await t.service.ingest(msg);
      await t.advance(BOT_PAUSE_MS + 1);
      expect(t.sent).toEqual([]);
      expect(t.events.map((e) => e.reason)).toEqual([reason]);
    }
  });

  it("диалог прежней версии бота (bot_step без состояния) не продолжается", async () => {
    const t = setup({ bot: "always" });
    await t.service.ingest(inbound());
    Object.assign(t.conv(), { botStep: 0, botState: null, botDueAt: null });
    await t.service.ingest(inbound({ text: "для мамы" }));
    await t.advance(BOT_PAUSE_MS + 1);
    expect(t.sent).toEqual([]);
    expect(t.conv().botStep).toBe(-1);
  });

  it("клиент замолчал на 30 минут — частичная сводка менеджеру, бот больше не пишет", async () => {
    const t = setup({ bot: "always" });
    await t.service.ingest(inbound());
    await t.advance(BOT_PAUSE_MS + 1);
    await t.advance(BOT_ABANDON_MS - 60_000);
    expect(t.notes).toEqual([]);
    await t.advance(2 * 60_000);
    expect(t.notes[0]).toContain("Клиент не ответил боту");
    expect(t.notes[0]).toContain("Не хватает: Для кого, Повод");
    expect(t.notified.at(-1)?.title).toBe("Клиент не ответил боту: Айгерим");
    expect(t.conv().botState).toMatchObject({ outcome: "abandoned" });
    await t.service.ingest(inbound({ text: "для мамы" }));
    await t.advance(BOT_PAUSE_MS + 1);
    expect(t.sent).toHaveLength(1);
  });

  it("«позвоните» — бот один раз отвечает, ставит задачу «позвонить» и замолкает", async () => {
    const t = setup({ bot: "always" });
    await t.service.ingest(inbound());
    await t.advance(BOT_PAUSE_MS + 1);
    await t.service.ingest(inbound({ text: "можете позвонить?" }));
    await t.advance(BOT_PAUSE_MS + 1);
    expect(t.sent[1]).toBe("Передала ваш вопрос менеджеру — он свяжется с вами в ближайшее время.");
    expect(t.tasks).toEqual([expect.objectContaining({ kind: "call", title: expect.stringContaining("Перезвонить: Айгерим") })]);
    expect(t.notified.at(-1)).toEqual({ title: "Клиент просит позвонить: Айгерим", kind: "task" });
    await t.service.ingest(inbound({ text: "алло" }));
    await t.advance(BOT_PAUSE_MS + 1);
    expect(t.sent).toHaveLength(2);
  });

  it("автоответ правила молчит, пока диалог ведёт бот; без бота — уходит и подписан «автоматически»", async () => {
    const t = setup({ bot: "always" });
    await t.service.ingest(inbound());
    expect(await t.service.sendAutomated(t.conv().id, "Ответим утром")).toBeNull();
    const off = setup();
    await off.service.ingest(inbound());
    expect(await off.service.sendAutomated(off.conv().id, "Ответим утром")).toMatchObject({ status: "sent" });
    expect(off.msgs.at(-1)).toMatchObject({ source: "rule", authorId: null });
  });

  it("бота выключили посреди опроса — он замолкает", async () => {
    const t = setup({ bot: "always" });
    await t.service.ingest(inbound());
    await t.advance(BOT_PAUSE_MS + 1);
    await t.service.ingest(inbound({ text: "для мамы" }));
    t.settings.mode = "off";
    await t.advance(BOT_PAUSE_MS + 1);
    await t.service.ingest(inbound({ text: "на день рождения" }));
    await t.advance(BOT_ABANDON_MS + 1);
    expect(t.sent).toHaveLength(1);
    expect(t.conv().botState).toMatchObject({ outcome: "disabled" });
    // Пока бот выключен, сообщения клиента снова приходят менеджеру уведомлениями.
    expect(t.notified.at(-1)?.title).toBe("Айгерим · WhatsApp");
  });

  it("номер или карта в тексте из настроек не уходят клиенту", async () => {
    const config: BotConfig = { ...BOT_CONFIG, texts: { ...BOT_CONFIG.texts, ru: { ...BOT_CONFIG.texts.ru, greeting: "Здравствуйте! Пишите на +7 701 555 44 33" } } };
    const t = setup({ bot: "always", config });
    await t.service.ingest(inbound());
    await t.advance(BOT_PAUSE_MS + 1);
    expect(t.sent).toEqual([]);
    expect(t.events.some((e) => e.reason === "blocked:phone")).toBe(true);
  });

  it("кнопка «Запустить бота» — для диалога, где бот не работал; «Остановить» — сразу", async () => {
    const t = setup({ bot: "always" });
    await t.service.ingest(inbound({ text: "Маме" })); // похоже на продолжение — бот не начал
    await t.advance(BOT_PAUSE_MS + 1);
    expect(t.sent).toEqual([]);
    await t.bot.startManually(t.conv().id);
    expect(t.sent[0]).toContain("Для кого книга?");
    await expect(t.bot.startManually(t.conv().id)).rejects.toThrow("Бот уже ведёт этот диалог");
    expect(await t.bot.stopByHuman(t.conv().id, "button")).toBe(true);
    expect(t.conv().botState).toMatchObject({ outcome: "stopped_by_manager", reason: "button" });
  });
});

describe("история переписки из шлюза после привязки номера", () => {
  const msg = (id: string, minutes: number, text: string, isEcho = false): InboundMessage => ({
    externalId: id,
    channelId: "gowa",
    chatType: "whatsapp",
    chatId: "77011234567",
    at: new Date(start.getTime() - (1000 - minutes) * 60_000),
    isEcho,
    type: "text",
    text,
    mediaUrl: null,
    contactName: isEcho ? "" : "Айгерим",
    avatarUrl: null,
    status: null,
  });
  const chat = [msg("h1", 1, "Здравствуйте, хочу книгу маме"), msg("h2", 2, "Добрый день! Расскажу", true), msg("h3", 3, "Спасибо")];

  it("клиент с этим номером: диалог с ним, все сообщения задним числом — без заявки, уведомлений, «непрочитано» и «ждёт ответа»", async () => {
    const t = setup({ clients: { "77011234567": "client-1" } });
    expect(await t.service.importHistory(chat, { anyWhatsappChannel: true })).toEqual({ imported: 3, skipped: null });
    const [conv] = [...t.convs.values()];
    expect(conv).toMatchObject({ clientId: "client-1", contactName: "Айгерим", unread: 0, awaiting: null, lastText: "Спасибо" });
    expect(t.msgs.map((m) => [m.dir, m.text])).toEqual([["in", "Здравствуйте, хочу книгу маме"], ["out", "Добрый день! Расскажу"], ["in", "Спасибо"]]);
    expect(t.deals).toEqual([]);
    expect(t.notified).toEqual([]);
    expect(await t.service.importHistory(chat, { anyWhatsappChannel: true })).toEqual({ imported: 0, skipped: null });
    expect(t.msgs).toHaveLength(3);
  });

  it("незнакомый номер — пропуск, ничего не создаётся; открытая сделка с этим номером — диалог привязывается к ней", async () => {
    const t = setup();
    expect(await t.service.importHistory(chat, { anyWhatsappChannel: true })).toEqual({ imported: 0, skipped: "unknown" });
    expect(t.convs.size).toBe(0);
    const d = setup({ openDeal: { id: "deal-7", assigneeId: "m1" } });
    await d.service.importHistory(chat, { anyWhatsappChannel: true });
    expect([...d.convs.values()][0]).toMatchObject({ dealId: "deal-7", assigneeId: "m1" });
  });

  it("уже есть диалог — история дописывается, последнее сообщение не откатывается на более старое", async () => {
    const t = setup();
    await t.service.ingest(msg("new", 999, "Новое сообщение"), { anyWhatsappChannel: true });
    const conv = [...t.convs.values()][0];
    Object.assign(conv, { lastText: "Новое сообщение", lastAt: msg("new", 999, "").at });
    expect(await t.service.importHistory(chat, { anyWhatsappChannel: true })).toMatchObject({ imported: 3 });
    expect(conv.lastText).toBe("Новое сообщение");
    expect(t.msgs).toHaveLength(4);
  });

  it("номер в спаме — пропуск", async () => {
    const t = setup({ blocked: true, clients: { "77011234567": "client-1" } });
    expect(await t.service.importHistory(chat)).toEqual({ imported: 0, skipped: "blocked" });
  });
});

describe("секреты в переписке: ссылка доступа в CRM — только с маской", () => {
  const token = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcd";
  const link = `https://mybook.kz/reset/${token}`;
  const text = `Задайте пароль и войдите: ${link}\nЛогин: +7 701 123 45 67`;
  const masked = "Задайте пароль и войдите: https://mybook.kz/reset/••••\nЛогин: +7 701 123 45 67";

  it("redactSecrets: /reset/<токен> и /kk/reset/<токен> — с маской, остальное как есть; превью — тоже", () => {
    expect(redactSecrets(text)).toBe(masked);
    expect(redactSecrets("https://mybook.kz/kk/reset/abcdefgh12345678 и ещё https://mybook.kz/reset/zzzzzzzzzzzz")).toBe("https://mybook.kz/kk/reset/•••• и ещё https://mybook.kz/reset/••••");
    expect(redactSecrets("https://mybook.kz/pay/abcdefgh12345678 /reset/ /reset/short")).toBe("https://mybook.kz/pay/abcdefgh12345678 /reset/ /reset/short");
    expect(preview(text)).not.toContain(token);
  });

  it("исходящее: клиенту — целиком, в CRM и превью — с маской; эхо узнаётся по маске и не дублируется", async () => {
    const t = setup({ noExternalId: true });
    await t.service.ingest(inbound());
    const [c] = [...t.convs.values()];
    const msg = await t.service.send(c.id, text, null);
    expect(t.sent).toEqual([text]);
    expect(msg.text).toBe(masked);
    expect(t.msgs.filter((m) => m.dir === "out").map((m) => m.text)).toEqual([masked]);
    expect(c.lastText).not.toContain(token);
    // эхо со шлюза приходит с полным текстом — захватывается та же запись
    await t.service.ingest(inbound({ externalId: "gw-echo", isEcho: true, text }));
    expect(t.msgs.filter((m) => m.dir === "out")).toEqual([expect.objectContaining({ text: masked, externalId: "gw-echo" })]);
    // эхо, отправленное с телефона мимо CRM, — тоже с маской
    await t.service.ingest(inbound({ externalId: "gw-phone", isEcho: true, text: `ещё раз: ${link}` }));
    expect(t.msgs.at(-1)!.text).toBe("ещё раз: https://mybook.kz/reset/••••");
    expect(c.lastText).not.toContain(token);
  });

  it("входящее (клиент переслал ссылку), история из шлюза и внутренняя заметка — с маской", async () => {
    const t = setup({ clients: { "77011234567": "client-1" } });
    await t.service.ingest(inbound({ externalId: "in-1", text: `вот ссылка ${link} не открывается` }));
    const [c] = [...t.convs.values()];
    expect(t.msgs.at(-1)!.text).toBe("вот ссылка https://mybook.kz/reset/•••• не открывается");
    expect(c.lastText).not.toContain(token);
    await t.service.importHistory([inbound({ externalId: "h-1", text: link }), inbound({ externalId: "h-2", isEcho: true, text: `пароль: ${link}` })], { anyWhatsappChannel: true });
    expect(t.msgs.slice(-2).map((m) => m.text)).toEqual(["https://mybook.kz/reset/••••", "пароль: https://mybook.kz/reset/••••"]);
    const note = await t.service.addInternalNote(c.id, `клиенту ушла ${link}`, null);
    expect(note.text).toBe("клиенту ушла https://mybook.kz/reset/••••");
    expect(t.msgs.every((m) => !m.text.includes(token))).toBe(true);
  });
});
