import { describe, expect, it } from "vitest";
import { GOWA_CATCHUP, gowaCatchUpRange, isGowaPersonalJid, parseGowaHistory } from "@/modules/messaging/domain/gowa";
import { inbound, setup, start } from "./doubles/botHarness";

/**
 * Скорость и надёжность WhatsApp через свой шлюз (GOWA): сообщение видно в CRM сразу, потерянный вебхук догоняет
 * сверка со шлюзом, на сообщение клиента — звук.
 */
describe("сверка со шлюзом: окно и что считается сообщением", () => {
  it("последние 45 секунд не трогаем — их доставляет вебхук; первый проход смотрит на 2 часа, дальше — на 10 минут", () => {
    const now = new Date("2026-10-18T12:00:00Z");
    expect(gowaCatchUpRange(now, false)).toEqual({ from: new Date("2026-10-18T11:49:15Z"), to: new Date("2026-10-18T11:59:15Z") });
    expect(gowaCatchUpRange(now, true).from).toEqual(new Date("2026-10-18T09:59:15Z"));
    expect(GOWA_CATCHUP.everyMs).toBeLessThanOrEqual(GOWA_CATCHUP.settleMs);
  });

  it("звонок шлюз хранит строкой-сообщением — это не сообщение клиента; группы и каналы — не личные чаты", () => {
    const row = { id: "C1", chat_jid: "77011234567@s.whatsapp.net", content: "", timestamp: "2026-10-18T11:55:00Z", is_from_me: false, media_type: "call" };
    expect(parseGowaHistory(row)).toBeNull();
    expect(isGowaPersonalJid("77011234567@s.whatsapp.net")).toBe(true);
    expect(isGowaPersonalJid("123456789012345@lid")).toBe(true);
    expect(isGowaPersonalJid("120363@g.us")).toBe(false);
    expect(isGowaPersonalJid("120363@newsletter")).toBe(false);
  });
});

describe("сверка со шлюзом: потерянные сообщения проходят обычным путём", () => {
  it("новое сообщение, которого нет в CRM, — как из вебхука: заявка, «ждёт ответа», уведомление; известное — пропускаем", async () => {
    const t = setup({ bot: "off" });
    const first = inbound({ text: "Здравствуйте" });
    await t.service.ingest(first);
    const lost = inbound({ text: "Сколько стоит книга?", at: new Date(start.getTime() + 60_000) });
    const notifiedBefore = t.notified.length;
    expect(await t.service.catchUp([first, lost])).toBe(1);
    expect(t.msgs.map((m) => m.text)).toEqual(["Здравствуйте", "Сколько стоит книга?"]);
    expect(t.notified.length).toBe(notifiedBefore + 1);
    expect(t.conv().unread).toBe(2);
    expect(await t.service.catchUp([first, lost])).toBe(0);
  });

  it("сообщение старше последнего в диалоге — тихо в историю: не поднимает «ждёт ответа» поверх ответа менеджера", async () => {
    const t = setup({ bot: "off" });
    await t.service.ingest(inbound({ text: "Здравствуйте" }));
    await t.service.send(t.conv().id, "Добрый день! Чем помочь?", "staff-1");
    Object.assign(t.conv(), { lastMessageAt: new Date(start.getTime() + 10 * 60_000) });
    const notifiedBefore = t.notified.length;
    const late = inbound({ text: "Это я ещё до ответа написала", at: new Date(start.getTime() + 5 * 60_000) });
    expect(await t.service.catchUp([late])).toBe(1);
    expect(t.msgs.map((m) => m.text)).toContain("Это я ещё до ответа написала");
    expect(t.notified.length).toBe(notifiedBefore);
    expect(t.conv().awaiting).toBeNull();
  });

  it("незнакомый номер, написавший, пока сайт перезапускался, — новая заявка, а не потеря", async () => {
    const t = setup({ bot: "off" });
    expect(await t.service.catchUp([inbound({ chatId: "77019998877", contactName: "Новый клиент", text: "Хочу книгу" })])).toBe(1);
    expect(t.deals).toHaveLength(1);
    expect(t.notified.map((n) => n.kind)).toContain("message");
  });
});

describe("сообщение видно в CRM сразу", () => {
  it("входящее: сигнал вкладкам сразу после записи (до бота и уведомлений) и ещё раз в конце; ответ с телефона магазина — тоже", async () => {
    const t = setup({ bot: "off" });
    await t.service.ingest(inbound({ text: "Здравствуйте" }));
    const id = t.conv().id;
    expect(t.changed.filter((c) => c === id).length).toBeGreaterThanOrEqual(2);
    const before = t.changed.length;
    await t.service.ingest(inbound({ text: "Ответ с телефона", isEcho: true, contactName: "" }));
    expect(t.changed.slice(before)).toContain(id);
  });
});
