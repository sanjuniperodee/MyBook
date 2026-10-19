import { describe, expect, it } from "vitest";
import { staffLine } from "@/modules/messaging/infrastructure/staffLine";
import { inbound, setup } from "./doubles/botHarness";

/**
 * Напоминание сотруднику в WhatsApp не создаёт заявку (tasks-d5): номер действующего сотрудника — служебная переписка,
 * эхо напоминания, отправленного CRM с номера магазина, не заводит диалог и не «отвечает с телефона магазина».
 */
const STAFF = "77015550011";
const reminder = "⏰ Через 1 ч срок задачи: Перезвонить Айгерим\nСрок: 01.10 12:00\nhttps://mybook.kz/admin/deals/d1";

function line(phones: string[] = ["+7 701 555 00 11"]) {
  let lookups = 0;
  let now = 0;
  const l = staffLine(async () => (lookups++, phones), () => now);
  return { l, lookups: () => lookups, tick: (ms: number) => (now += ms) };
}

describe("служебная линия: номера сотрудников и отправленные им сообщения", () => {
  it("номер сотрудника узнаётся в любом виде (8…, +7 …); список перечитывается не чаще раза в минуту", async () => {
    const t = line(["+7 701 555 00 11", "", "87025550022"]);
    expect(await t.l.isStaffPhone(STAFF)).toBe(true);
    expect(await t.l.isStaffPhone("77025550022")).toBe(true);
    expect(await t.l.isStaffPhone("77011234567")).toBe(false);
    expect(t.lookups()).toBe(1);
    t.tick(61_000);
    await t.l.isStaffPhone(STAFF);
    expect(t.lookups()).toBe(2);
  });

  it("эхо отправленного — по id или по тексту (эхо раньше id, скрытый номер); через сутки забывается", () => {
    const t = line();
    t.l.remember({ text: reminder });
    expect(t.l.isServiceEcho({ externalId: "gw-1", text: reminder })).toBe(true);
    t.l.remember({ externalId: "gw-2", text: reminder });
    expect(t.l.isServiceEcho({ externalId: "gw-2", text: "другой текст" })).toBe(true);
    expect(t.l.isServiceEcho({ externalId: "gw-3", text: "Здравствуйте" })).toBe(false);
    t.tick(24 * 3_600_000 + 1);
    expect(t.l.isServiceEcho({ externalId: "gw-2", text: reminder })).toBe(false);
  });
});

describe("ingest: переписка с номером сотрудника — не заявка", () => {
  it("эхо напоминания, отправленного CRM, — ни диалога, ни заявки, ни захвата «с телефона магазина»", async () => {
    const { l } = line();
    const t = setup({ staffLine: l, phoneHolder: { id: "m1", name: "Айгерим" } });
    l.remember({ externalId: "gw-1", text: reminder });
    await t.service.ingest(inbound({ chatId: STAFF, externalId: "gw-1", isEcho: true, text: reminder, contactName: "" }), { anyWhatsappChannel: true });
    // Эхо со скрытым номером (LID) и своим id — узнаётся по тексту.
    await t.service.ingest(inbound({ chatId: "123456789@lid", externalId: "gw-lid", isEcho: true, text: reminder, contactName: "" }), { anyWhatsappChannel: true });
    expect(t.convs.size).toBe(0);
    expect(t.msgs).toHaveLength(0);
    expect(t.claims).toEqual([]);
  });

  it("сотрудник ответил на напоминание — сообщение в его диалоге тихо: без заявки, «ждёт ответа», уведомлений и бота", async () => {
    const { l } = line();
    const t = setup({ staffLine: l, bot: "always", phoneHolder: { id: "m1", name: "Айгерим" } });
    await t.service.ingest(inbound({ chatId: STAFF, externalId: "in-1", text: "Ок, перезвоню" }));
    expect(t.deals).toEqual([]);
    const c = t.conv();
    expect(c).toMatchObject({ dealId: null, unread: 0, awaiting: null, lastText: "Ок, перезвоню" });
    expect(t.msgs).toHaveLength(1);
    expect(t.notified).toEqual([]);
    expect(t.sent).toEqual([]); // бот не здоровается
    // Сообщение коллеге с телефона магазина (не CRM) — в тот же диалог, заявку магазину не «берёт».
    await t.service.ingest(inbound({ chatId: STAFF, externalId: "out-1", isEcho: true, text: "Спасибо!", contactName: "" }));
    expect(t.msgs.map((m) => m.dir)).toEqual(["in", "out"]);
    expect(t.claims).toEqual([]);
    expect(t.deals).toEqual([]);
  });

  it("клиент с другим номером — как раньше: заявка и «ждёт ответа»", async () => {
    const { l } = line();
    const t = setup({ staffLine: l });
    await t.service.ingest(inbound());
    expect(t.deals).toHaveLength(1);
    expect(t.conv()).toMatchObject({ unread: 1, awaiting: expect.any(Date) });
  });
});
