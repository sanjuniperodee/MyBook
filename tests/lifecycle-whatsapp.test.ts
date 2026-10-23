import { describe, expect, it } from "vitest";
import { LifecycleService, type ClientChat, type DraftCandidate, type EmailTemplates, type OrderReminder, type Recipient } from "@/modules/notifications/application";
import { parseChatKinds, type DraftProgress } from "@/modules/notifications/domain";
import { emailTemplates } from "@/modules/notifications/infrastructure/templates";
import { BANK_READY } from "@/lib/content/kinds";
import { inbound, setup as chatSetup } from "./doubles/botHarness";
import { storeTimeZoneIs } from "./doubles/time";

// Автописьма клиентам без почты — в WhatsApp (automation-16).
storeTimeZoneIs("Asia/Almaty");
const DAY = 86_400_000;
const now = new Date("2026-10-01T08:00:00Z"); // 13:00 в Алматы

const stub = (id: string, locale: "ru" | "kk" = "ru"): Recipient => ({ id, email: "77011234567@phone.invalid", name: "Айгерим", locale, remindedAt: null, optOut: false });
const book = (p: Partial<DraftProgress> = {}): DraftProgress => ({
  bookId: "b1",
  title: "Маме",
  occasion: null,
  occasionDate: null,
  updatedAt: new Date(now.getTime() - 10 * DAY),
  theme: "mom",
  answered: BANK_READY,
  words: 900,
  firstEmpty: null,
  hasOrder: false,
  remindedAt: null,
  ...p,
});

function lifecycle(data: { drafts?: DraftCandidate[]; unpaid?: OrderReminder[]; kinds?: string; chat?: (clientId: string, text: string) => Awaited<ReturnType<ClientChat["send"]>> }) {
  const sent: string[] = [];
  const mails: string[] = [];
  const claimed = new Set<string>();
  const templates: EmailTemplates = emailTemplates({ url: (o, l) => `https://mybooks.kz/review/${o}?l=${l}`, thankYouPercent: 15 });
  const chat: ClientChat = {
    kinds: async () => parseChatKinds(data.kinds ?? '["deadline","almost","unpaid","review"]'),
    send: async (clientId, text) => {
      const r = data.chat?.(clientId, text) ?? "sent";
      if (r === "sent") sent.push(text);
      return r;
    },
  };
  const service = new LifecycleService(
    { draftCandidates: async () => data.drafts ?? [], unpaidOrders: async () => data.unpaid ?? [], reviewDue: async () => [], latestDraft: async () => null },
    { claim: async (u, k) => !claimed.has(`${u}:${k}`) && !!claimed.add(`${u}:${k}`), release: async (u, k) => void claimed.delete(`${u}:${k}`) },
    { find: async () => null, markReminded: async () => {}, optOut: async () => {} },
    templates,
    { configured: async () => true, send: async (to) => (mails.push(to), "sent") },
    { emailSent: async () => {} },
    { now: () => now },
    chat,
  );
  return { service, sent, mails, claimed };
}

describe("автописьма клиентам без почты — в WhatsApp (automation-16)", () => {
  it("настройка: включённые письма из JSON-списка, мусор — выключено", () => {
    expect([...parseChatKinds('["almost","review","start","x"]')]).toEqual(["almost", "review"]);
    expect(parseChatKinds("мусор").size).toBe(0);
    expect(parseChatKinds("").size).toBe(0);
  });

  it("«книга почти готова» уходит в WhatsApp один раз, письмом — нет", async () => {
    const s = lifecycle({ drafts: [{ recipient: stub("u1"), book: book() }] });
    expect(await s.service.run()).toBe(1);
    expect(s.mails).toEqual([]);
    expect(s.sent).toHaveLength(1);
    expect(s.sent[0]).toMatch(/^Здравствуйте, Айгерим! Книга «Маме» почти готова/);
    expect(s.sent[0]).toContain("/books/b1/preview");
    expect(await s.service.run()).toBe(0);
  });

  it("письмо выключено в настройке — не пишем; «советы как начать» в WhatsApp не уходят никогда", async () => {
    const off = lifecycle({ drafts: [{ recipient: stub("u1"), book: book() }], kinds: '["unpaid"]' });
    expect(await off.service.run()).toBe(0);
    const start = lifecycle({ drafts: [{ recipient: stub("u1"), book: book({ answered: 0, words: 0 }) }] });
    expect(await start.service.run()).toBe(0);
    expect(start.claimed.size).toBe(0);
  });

  it("недавно писали или переписки нет — отметку снимаем, следующий проход пробует снова", async () => {
    let res: "recent" | "no_chat" | "sent" = "recent";
    const s = lifecycle({ unpaid: [{ recipient: stub("u1", "kk"), theme: "mom", orderId: "o1", number: 12, amount: 25000, contactEmail: "77011234567@phone.invalid" }], chat: () => res });
    expect(await s.service.run()).toBe(0);
    expect(s.claimed.size).toBe(0);
    res = "no_chat";
    expect(await s.service.run()).toBe(0);
    res = "sent";
    expect(await s.service.run()).toBe(1);
    // Казахоязычному клиенту — по-казахски, со ссылкой на заказ на его языке.
    expect(s.sent[0]).toMatch(/^Сәлеметсіз бе, Айгерим! .*№12 тапсырыс рәсімделді/);
    expect(s.sent[0]).toContain("/kk/orders/o1");
  });

  it("клиенту с настоящей почтой — письмом, не в WhatsApp", async () => {
    const s = lifecycle({ drafts: [{ recipient: { ...stub("u1"), email: "a@b.kz" }, book: book() }] });
    expect(await s.service.run()).toBe(1);
    expect(s.mails).toEqual(["a@b.kz"]);
    expect(s.sent).toEqual([]);
  });
});

describe("MessagingService.sendToClient: только в существующую переписку, без «пишут втроём»", () => {
  const at = new Date("2026-10-01T06:00:00Z"); // 11:00 по Алматы — окно открыто

  it("переписки нет — no_chat, ничего не уходит", async () => {
    const chat = chatSetup({ clients: { "77011234567": "u1" } });
    expect(await chat.service.sendToClient("u1", "Книга почти готова", { rule: "Автописьмо" })).toBe("no_chat");
    expect(chat.sent).toEqual([]);
  });

  it("менеджер писал за двое суток или бот за сутки — recent; позже — уходит сообщением правила", async () => {
    const chat = chatSetup({ clients: { "77011234567": "u1" } });
    await chat.service.ingest(inbound({ text: "Здравствуйте" }));
    const id = chat.conv().id;
    expect(chat.conv().clientId).toBe("u1");
    chat.setNow(at);
    await chat.service.send(id, "Добрый день!", "m1");
    chat.setNow(new Date(at.getTime() + 47 * 3_600_000));
    expect(await chat.service.sendToClient("u1", "Книга почти готова", { rule: "Автописьмо" })).toBe("recent");
    chat.setNow(new Date(at.getTime() + 49 * 3_600_000));
    expect(await chat.service.sendToClient("u1", "Книга почти готова", { rule: "Автописьмо" })).toBe("sent");
    expect(chat.sent.at(-1)).toBe("Книга почти готова");
    expect(chat.msgs.at(-1)).toMatchObject({ source: "rule" });
    // Только что написало правило — следующее автописьмо ждёт сутки.
    chat.setNow(new Date(at.getTime() + 60 * 3_600_000));
    expect(await chat.service.sendToClient("u1", "Оплатите заказ", { rule: "Автописьмо" })).toBe("recent");
  });

  it("вне окна 09–21 и «не писать первым» — skipped без заметки в сделку", async () => {
    const chat = chatSetup({ clients: { "77011234567": "u1" } });
    await chat.service.ingest(inbound({ text: "Здравствуйте" }));
    chat.setNow(new Date("2026-10-03T17:00:00Z")); // 22:00 по Алматы
    const notes = chat.notes.length;
    expect(await chat.service.sendToClient("u1", "Книга почти готова", { rule: "Автописьмо" })).toBe("skipped");
    expect(chat.notes.length).toBe(notes);
    const blocked = chatSetup({ clients: { "77011234567": "u1" }, noMarketing: ["77011234567"] });
    await blocked.service.ingest(inbound({ text: "Здравствуйте" }));
    blocked.setNow(new Date("2026-10-03T06:00:00Z"));
    expect(await blocked.service.sendToClient("u1", "Книга почти готова", { rule: "Автописьмо" })).toBe("skipped");
    expect(blocked.sent).toEqual([]);
  });
});
