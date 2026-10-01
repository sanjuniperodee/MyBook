import { describe, expect, it } from "vitest";
import { answerValue, botSummary, contactChanges, contactPhone, shouldApplyStatus, type Conversation, type InboundMessage } from "@/modules/messaging/domain";
import { MessagingService, QualifierBot, type ConversationRepository, type MessageRepository, type SalesGateway } from "@/modules/messaging/application";

const now = new Date("2026-10-01T06:00:00Z");

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

  it("ответ бота → значение поля: вариант из списка, число, текст", () => {
    expect(answerValue("электронная", { key: "format", label: "Формат", type: "select", options: ["Печатная", "Электронная"] })).toBe("Электронная");
    expect(answerValue("2,5", { key: "n", label: "N", type: "number", options: [] })).toBe(2.5);
    expect(answerValue("  для мамы ", undefined)).toBe("для мамы");
    expect(botSummary({ greeting: "", finish: "", questions: [{ text: "?", field: "recipient" }] }, [{ key: "recipient", label: "Для кого", type: "text", options: [] }], {})).toBe("Для кого: —");
  });
});

// ─── инбокс ────────────────────────────────────────────────────────────────

function setup(opts: { blocked?: boolean; bot?: "off" | "always" } = {}) {
  const convs = new Map<string, Conversation & { unread: number; awaiting: Date | null; closed?: boolean }>();
  const msgs: { id: string; conv: string; dir: "in" | "out"; text: string; externalId: string | null; status: string }[] = [];
  const deals: { id: string; title: string; unsorted: boolean; fields: Record<string, unknown> }[] = [];
  const sent: string[] = [];
  const notes: string[] = [];
  let seq = 0;
  const conversations: ConversationRepository = {
    findById: async (id) => convs.get(id) ?? null,
    findByChat: async (ch, chId, chat) => [...convs.values()].find((c) => c.channel === ch && c.channelId === chId && c.chatId === chat) ?? null,
    create: async (i) => {
      const c = { ...i, id: `c${++seq}`, dealId: null, assigneeId: null, botStep: null, unread: 0, awaiting: null };
      convs.set(c.id, c);
      return c;
    },
    updateContact: async (id, p) => Object.assign(convs.get(id)!, p),
    linkDeal: async (id, l) => Object.assign(convs.get(id)!, l),
    recordIncoming: async (id, _t, at) => {
      const c = convs.get(id)!;
      c.unread++;
      c.awaiting ??= at;
    },
    recordEcho: async (id) => void Object.assign(convs.get(id)!, { unread: 0, awaiting: null }),
    recordOutgoing: async (id, _t, _at, author) => void (author && Object.assign(convs.get(id)!, { unread: 0, awaiting: null, botStep: -1 })),
    closeAsSpam: async (id) => void Object.assign(convs.get(id)!, { closed: true }),
    markRead: async (id) => void Object.assign(convs.get(id)!, { unread: 0 }),
    advanceBot: async (id, from, to) => {
      const c = convs.get(id)!;
      if (c.botStep !== from) return false;
      c.botStep = to;
      return true;
    },
    latestWhatsapp: async () => null,
    assignByDeal: async () => {},
    chatIdsByDeal: async () => [],
    closeByDeal: async () => {},
  };
  const messages: MessageRepository = {
    insertIncoming: async (conv, m) => (msgs.some((x) => x.externalId === m.externalId) ? false : !!msgs.push({ id: `m${++seq}`, conv, dir: "in", text: m.text, externalId: m.externalId, status: "received" })),
    existsExternal: async (e) => msgs.some((x) => x.externalId === e),
    claimPendingEcho: async (conv, text, _s, ext) => {
      const p = msgs.find((x) => x.conv === conv && x.dir === "out" && !x.externalId && x.text === text);
      if (p) p.externalId = ext;
      return !!p;
    },
    insertEcho: async (conv, m) => !!msgs.push({ id: `m${++seq}`, conv, dir: "out", text: m.text, externalId: m.externalId, status: "sent" }),
    insertOutgoing: async (conv, text, authorId) => {
      const m = { id: `m${++seq}`, conv, dir: "out" as const, text, externalId: null, status: "pending" };
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
    findClientByPhone: async () => null,
    findOpenDeal: async () => null,
    createDeal: async (i) => {
      const d = { id: `d${++seq}`, title: i.title, unsorted: i.unsorted, fields: {} };
      deals.push(d);
      return { id: d.id, assigneeId: null, clientId: null };
    },
    setUtmIfEmpty: async () => {},
    acceptUnsorted: async (dealId) => void (deals.find((d) => d.id === dealId)!.unsorted = false),
    note: async (_d, text) => void notes.push(text),
    setField: async (dealId, k, v) => void (deals.find((d) => d.id === dealId)!.fields[k] = v),
    deal: async (id) => {
      const d = deals.find((x) => x.id === id);
      return d ? { id: d.id, clientId: null, assigneeId: null, title: d.title, contactName: "", customFields: d.fields } : null;
    },
    nextRoundRobin: async () => null,
  };
  const quiet = { info: () => {}, warn: () => {}, error: () => {} };
  const notifier = { notify: async () => {} };
  const clock = { now: () => now };
  const bot = new QualifierBot(
    conversations,
    { mode: async () => opts.bot ?? "off", config: async () => ({ greeting: "Здравствуйте, {имя}!", finish: "Спасибо!", questions: [{ text: "Для кого книга?", field: "recipient" }] }), isWorkTime: async () => true, dealFields: async () => [{ key: "recipient", label: "Для кого", type: "text", options: [] }] },
    sales,
    notifier,
    clock,
  );
  const service = new MessagingService(
    conversations,
    messages,
    { isBlocked: async () => !!opts.blocked, add: async () => {}, remove: async () => {} },
    { send: async (_c, _id, text) => (sent.push(text), { ok: true, externalId: `wz-${sent.length}` }) },
    sales,
    { fromText: async () => null },
    notifier,
    { chatChanged: () => {}, notificationsChanged: () => {} },
    { messageIncoming: async () => {} },
    bot,
    clock,
    quiet,
  );
  return { service, convs, msgs, deals, sent, notes };
}

const inbound = (p: Partial<InboundMessage> = {}): InboundMessage => ({ externalId: "e1", channelId: "ch", chatType: "whatsapp", chatId: "77011234567", at: now, isEcho: false, type: "text", text: "Здравствуйте", mediaUrl: null, contactName: "Айгерим", avatarUrl: null, status: null, ...p });

describe("MessagingService", () => {
  it("новое обращение: диалог, заявка в «Неразобранном», «ждёт ответа»; повтор вебхука не дублирует", async () => {
    const { service, convs, deals, msgs } = setup();
    await service.ingest(inbound());
    await service.ingest(inbound());
    const [c] = [...convs.values()];
    expect(deals).toEqual([expect.objectContaining({ title: "Заявка из WhatsApp: Айгерим", unsorted: true })]);
    expect(c).toMatchObject({ dealId: deals[0].id, unread: 1, awaiting: now });
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

  it("спам: сообщение сохранено, заявки нет, диалог закрыт", async () => {
    const { service, convs, deals } = setup({ blocked: true });
    await service.ingest(inbound());
    expect(deals).toHaveLength(0);
    expect([...convs.values()][0].closed).toBe(true);
  });

  it("бот: приветствие и вопрос, ответ — в поле сделки, сводка менеджеру", async () => {
    const { service, deals, sent, notes } = setup({ bot: "always" });
    await service.ingest(inbound());
    expect(sent).toEqual(["Здравствуйте, Айгерим!\n\nДля кого книга?"]);
    await service.ingest(inbound({ externalId: "e2", text: "для мамы" }));
    expect(deals[0].fields).toEqual({ recipient: "для мамы" });
    expect(sent.at(-1)).toBe("Спасибо!");
    expect(notes[0]).toContain("Для кого: для мамы");
  });
});
