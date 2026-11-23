import { describe, expect, it } from "vitest";
import { parseGowaChange } from "@/modules/messaging/domain/gowa";
import { inbound, setup, start } from "./doubles/botHarness";

/**
 * Правки и «удалить для всех», сделанные в WhatsApp (клиентом или с телефона магазина): шлюз шлёт message.edited и
 * message.revoked, CRM показывает «изменено» с прежним текстом и «удалено клиентом», не пряча текст от сотрудников.
 */
describe("события шлюза", () => {
  const hook = (event: string, payload: Record<string, unknown>) => ({ event, device_id: "77775932124@s.whatsapp.net", payload: { chat_id: "77011234567@s.whatsapp.net", timestamp: "2026-11-24T10:00:00Z", is_from_me: false, ...payload } });

  it("правка: id исходного сообщения и новый текст", () => {
    expect(parseGowaChange(hook("message.edited", { original_message_id: "3EB0ABC123", body: " Новый текст " }))).toEqual({ edit: { externalId: "3EB0ABC123", text: "Новый текст", at: new Date("2026-11-24T10:00:00Z"), fromMe: false }, revoke: null });
  });

  it("удаление: id удалённого; группы, пустые и чужие id — мимо", () => {
    expect(parseGowaChange(hook("message.revoked", { revoked_message_id: "3EB0ABC123", is_from_me: true })).revoke).toEqual({ externalId: "3EB0ABC123", at: new Date("2026-11-24T10:00:00Z"), fromMe: true });
    expect(parseGowaChange(hook("message.revoked", { revoked_message_id: "../x" })).revoke).toBeNull();
    expect(parseGowaChange(hook("message.edited", { original_message_id: "3EB0ABC123", body: "" })).edit).toBeNull();
    expect(parseGowaChange({ ...hook("message.edited", { original_message_id: "3EB0ABC123", body: "x" }), payload: { chat_id: "123@g.us", original_message_id: "3EB0ABC123", body: "x" } }).edit).toBeNull();
    expect(parseGowaChange(hook("message", { id: "3EB0ABC123", body: "x" }))).toEqual({ edit: null, revoke: null });
  });
});

describe("сервис переписки", () => {
  it("клиент изменил сообщение: новый текст, прежний — в истории; повтор той же правки не плодит историю", async () => {
    const h = setup();
    await h.service.ingest(inbound({ externalId: "EXT1", text: "Хочу книгу маме" }));
    await h.service.applyExternalEdit({ externalId: "EXT1", text: "Хочу книгу бабушке", at: new Date(start.getTime() + 60_000), fromMe: false });
    await h.service.applyExternalEdit({ externalId: "EXT1", text: "Хочу книгу бабушке", at: new Date(start.getTime() + 61_000), fromMe: false });
    const m = h.msgs.find((x) => x.externalId === "EXT1")!;
    expect(m.text).toBe("Хочу книгу бабушке");
    expect(m.editHistory).toEqual([{ text: "Хочу книгу маме", at: new Date(start.getTime() + 60_000).toISOString() }]);
  });

  it("клиент удалил сообщение: пометка, текст остаётся; неизвестное сообщение — без ошибок", async () => {
    const h = setup();
    await h.service.ingest(inbound({ externalId: "EXT2", text: "Мой номер карты…" }));
    await h.service.applyExternalRevoke({ externalId: "EXT2", at: new Date(start.getTime() + 5_000), fromMe: false });
    await h.service.applyExternalRevoke({ externalId: "NOPE99", at: new Date(), fromMe: false });
    const m = h.msgs.find((x) => x.externalId === "EXT2")!;
    expect(m.revokedAt).toEqual(new Date(start.getTime() + 5_000));
    expect(m.text).toBe("Мой номер карты…");
  });
});
