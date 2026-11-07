import { describe, expect, it } from "vitest";
import { inbound, setup } from "./doubles/botHarness";
import { isGatewayDown } from "@/modules/messaging/domain";

// Повтор отправки при сбое шлюза (chats-22).
const at = (iso: string) => new Date(iso);

describe("«Повторить» у неотправленного сообщения", () => {
  it("тот же текст уходит, запись та же — статус «отправлено»; второй раз повторять нечего", async () => {
    const t = setup();
    await t.service.ingest(inbound({ text: "Здравствуйте" }));
    const id = t.conv().id;
    t.gateway.down = "Шлюз WhatsApp (GOWA) недоступен";
    const failed = await t.service.send(id, "Добрый день!", "m1");
    expect(failed.status).toBe("error");
    t.gateway.down = null;
    expect(await t.service.resend(id, failed.id)).toEqual({ ok: true });
    expect(t.sent).toEqual(["Добрый день!"]);
    expect(t.msgs.find((m) => m.id === failed.id)).toMatchObject({ status: "sent", error: null });
    await expect(t.service.resend(id, failed.id)).rejects.toThrow("только неотправленное");
  });

  it("ссылку доступа под маской заново не шлёт", async () => {
    const t = setup();
    await t.service.ingest(inbound({ text: "Здравствуйте" }));
    const id = t.conv().id;
    t.gateway.down = "Шлюз WhatsApp (GOWA) недоступен";
    const failed = await t.service.send(id, "Задайте пароль: https://mybooks.kz/reset/AbCdEf1234567890", null, "bot");
    t.gateway.down = null;
    await expect(t.service.resend(id, failed.id)).rejects.toThrow("ссылка доступа");
  });
});

describe("автоповтор сообщений бота и правил в минутном проходе", () => {
  it("шлюз лежал — один повтор через 5–30 минут; другая ошибка или повтор не помог — ответственному, и только раз", async () => {
    const t = setup();
    await t.service.ingest(inbound({ text: "Здравствуйте" }));
    const id = t.conv().id;
    t.setNow(at("2026-10-01T06:00:00Z"));
    t.gateway.down = "Шлюз WhatsApp (GOWA) недоступен";
    const down = await t.service.send(id, "Подскажу по срокам", null, "bot");
    t.gateway.down = "Номер не зарегистрирован в WhatsApp";
    const wrong = await t.service.send(id, "Ваша книга в печати", null, "rule");
    t.gateway.down = null;
    // Через 2 минуты повтор шлюзовой ошибки ещё рано, а «номер не в WhatsApp» — сразу ответственному.
    t.setNow(at("2026-10-01T06:02:00Z"));
    expect(await t.service.retryFailedAutomated()).toBe(0);
    expect(t.msgs.find((m) => m.id === wrong.id)?.error).toContain(" · повтор");
    const alerts = t.notified.length;
    expect(t.notified.at(-1)?.title).toContain("Не ушло сообщение бота");
    // Через 6 минут — повтор и он прошёл.
    t.setNow(at("2026-10-01T06:06:00Z"));
    expect(await t.service.retryFailedAutomated()).toBe(1);
    expect(t.sent).toEqual(["Подскажу по срокам"]);
    expect(t.msgs.find((m) => m.id === down.id)?.status).toBe("sent");
    // Больше ничего не трогаем и не уведомляем.
    expect(await t.service.retryFailedAutomated()).toBe(0);
    expect(t.notified.length).toBe(alerts);
  });

  it("признак «шлюз не ответил»", () => {
    expect(isGatewayDown("Шлюз WhatsApp (GOWA) недоступен")).toBe(true);
    expect(isGatewayDown("Wazzup недоступен, попробуйте ещё раз")).toBe(true);
    expect(isGatewayDown("connect ECONNREFUSED 127.0.0.1:3010")).toBe(true);
    expect(isGatewayDown("Номер не зарегистрирован в WhatsApp")).toBe(false);
    expect(isGatewayDown(null)).toBe(false);
  });
});

// Таймаут шлюза, а сообщение ушло (эхо или статус принесли его ID): не «ошибка» и второй раз не уходит.
describe("сообщение, которое ушло, хотя шлюз не ответил вовремя", () => {
  it("«Повторить» не шлёт второй раз, если у сообщения уже есть ID в WhatsApp — только снимает ошибку", async () => {
    const t = setup();
    await t.service.ingest(inbound({ text: "Здравствуйте" }));
    const id = t.conv().id;
    t.gateway.down = "Шлюз WhatsApp (GOWA) недоступен";
    const failed = await t.service.send(id, "Подскажу по срокам", null, "bot");
    t.gateway.down = null;
    // Эхо догнало: ID записан, статус ещё «ошибка» (так было до правки claimPendingEcho).
    Object.assign(t.msgs.find((m) => m.id === failed.id)!, { externalId: "wa-1" });
    expect(await t.service.resend(id, failed.id)).toEqual({ ok: true });
    expect(t.sent).toEqual([]);
    expect(t.msgs.find((m) => m.id === failed.id)).toMatchObject({ status: "sent", error: null, externalId: "wa-1" });
  });

  it("«доставлено» после ошибки таймаута снимает ошибку — минутный проход его не повторяет", async () => {
    const t = setup();
    await t.service.ingest(inbound({ text: "Здравствуйте" }));
    const id = t.conv().id;
    t.setNow(at("2026-10-01T06:00:00Z"));
    t.gateway.down = "Шлюз WhatsApp (GOWA) недоступен";
    const failed = await t.service.send(id, "Подскажу по срокам", null, "bot");
    t.gateway.down = null;
    Object.assign(t.msgs.find((m) => m.id === failed.id)!, { externalId: "wa-2" });
    await t.service.applyStatus({ externalId: "wa-2", status: "delivered", error: null });
    expect(t.msgs.find((m) => m.id === failed.id)?.status).toBe("delivered");
    t.setNow(at("2026-10-01T06:06:00Z"));
    expect(await t.service.retryFailedAutomated()).toBe(0);
    expect(t.sent).toEqual([]);
  });

  it("статус, пришедший раньше ответа на отправку, применяется, когда ID записан", async () => {
    const t = setup();
    await t.service.ingest(inbound({ text: "Здравствуйте" }));
    const id = t.conv().id;
    // Шлюз пришлёт этому сообщению ID wz-1 — «доставлено» по нему приходит до записи ID.
    await t.service.applyStatus({ externalId: "wz-1", status: "delivered", error: null });
    const msg = await t.service.send(id, "Добрый день!", "m1");
    expect(t.msgs.find((m) => m.id === msg.id)).toMatchObject({ externalId: "wz-1", status: "delivered" });
  });
});
