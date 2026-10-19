import { describe, expect, it } from "vitest";
import { MessageActionError } from "@/modules/messaging/application";
import { inbound, setup } from "./doubles/botHarness";

/** Диалог с сообщением клиента и ответом менеджера m1. */
async function chat() {
  const t = setup();
  await t.service.ingest(inbound({ text: "Здравствуйте, сколько стоит?" }));
  const conv = t.conv();
  const clientMsg = t.msgs.find((m) => m.dir === "in")!;
  const sent = await t.service.send(conv.id, "Добрый день! Сейчас подскажу", "m1");
  const mine = { id: sent.id, externalId: t.msgs.find((m) => m.id === sent.id)!.externalId };
  return { t, conv, clientMsg, mine };
}

describe("Сообщения в чате: ответ, правка, удаление, файлы", () => {
  it("ответ на сообщение клиента: в WhatsApp уходит цитата (id сообщения в канале), в CRM — ссылка на него", async () => {
    const { t, conv, clientMsg } = await chat();
    await t.service.send(conv.id, "Печатная — от 29 000", "m1", undefined, { replyToId: clientMsg.id });
    expect(t.sendOpts.at(-1)).toMatchObject({ replyTo: clientMsg.externalId });
    expect(t.msgs.at(-1)).toMatchObject({ replyToId: clientMsg.id });
  });

  it("ответ на сообщение чужого диалога или заметку — без цитаты", async () => {
    const { t, conv } = await chat();
    const note = await t.service.addInternalNote(conv.id, "для коллег", "m1");
    await t.service.send(conv.id, "ок", "m1", undefined, { replyToId: note.id });
    expect(t.sendOpts.at(-1)?.replyTo ?? null).toBeNull();
    expect(t.msgs.at(-1)?.replyToId ?? null).toBeNull();
  });

  it("правка своего сообщения в первые 15 минут — и у клиента, и в CRM с пометкой «изменено»", async () => {
    const { t, conv, mine } = await chat();
    await t.service.editMessage(conv.id, mine.id, "Добрый день! Сейчас всё подскажу 🙂", "m1");
    expect(t.edits).toEqual([{ externalId: mine.externalId, text: "Добрый день! Сейчас всё подскажу 🙂" }]);
    expect(t.msgs.find((m) => m.id === mine.id)).toMatchObject({ text: "Добрый день! Сейчас всё подскажу 🙂", editedAt: expect.any(Date) });
  });

  it("позже 15 минут, чужое или сообщение клиента — не правится", async () => {
    const { t, conv, clientMsg, mine } = await chat();
    await expect(t.service.editMessage(conv.id, mine.id, "x", "m2")).rejects.toBeInstanceOf(MessageActionError);
    await expect(t.service.editMessage(conv.id, clientMsg.id, "x", "m1")).rejects.toThrow("только своё");
    await t.advance(16 * 60_000);
    await expect(t.service.editMessage(conv.id, mine.id, "x", "m1")).rejects.toThrow("15 минут");
    expect(t.edits).toEqual([]);
  });

  it("удаление своего — «удалить для всех» у клиента и пометка в CRM; заметку — только у нас и в любое время", async () => {
    const { t, conv, mine } = await chat();
    await t.service.deleteMessage(conv.id, mine.id, "m1");
    expect(t.revokes).toEqual([mine.externalId]);
    expect(t.msgs.find((m) => m.id === mine.id)?.deletedAt).toBeInstanceOf(Date);
    await expect(t.service.deleteMessage(conv.id, mine.id, "m1")).rejects.toThrow("уже удалено");
    const note = await t.service.addInternalNote(conv.id, "заметка", "m1");
    await t.advance(5 * 86_400_000);
    await t.service.deleteMessage(conv.id, note.id, "m1");
    expect(t.revokes).toHaveLength(1);
  });

  it("файл клиенту: тип, подпись, ответ и «пересланное» уходят в канал; сообщение в CRM — с типом и ссылкой на файл", async () => {
    const { t, conv, clientMsg } = await chat();
    const r = await t.service.sendFile(conv.id, { data: new Uint8Array([1, 2, 3]), name: "primer.jpg", mime: "image/jpeg", kind: "image" }, "Пример книги", "m1", { mediaUrl: "store:chat-media/x", replyToId: clientMsg.id, forwarded: true });
    expect(r.status).toBe("sent");
    expect(t.files).toEqual([{ name: "primer.jpg", kind: "image", caption: "Пример книги", forwarded: true, replyTo: clientMsg.externalId }]);
    expect(t.msgs.at(-1)).toMatchObject({ type: "image", text: "Пример книги", mediaUrl: "store:chat-media/x", forwarded: true, externalId: "wzf-1" });
  });
});

describe("Реквизиты во всех путях отправки (chats-d4): правила и пересылка", () => {
  /** Номер магазина 7 700 555 66 77; клиент — 7 701 123 45 67 (номер чата). */
  async function two() {
    const t = setup({ shopPhone: "77005556677" });
    await t.service.ingest(inbound({ text: "Здравствуйте" }));
    await t.service.ingest(inbound({ chatId: "77029998877", text: "Добрый день", contactName: "Марат" }));
    const [a, b] = [...t.convs.values()];
    return { t, a, b };
  }

  it("правило с чужим номером или картой не уходит: заметка в сделку с названием правила, уведомление руководителям", async () => {
    const { t, a } = await two();
    expect(await t.service.sendAutomated(a.id, "Оплатите на карту 4111 1111 1111 1111 или позвоните +7 702 999 88 77", { rule: "Ответ ночью" })).toBeNull();
    expect(t.sent).toEqual([]);
    expect(t.notes.at(-1)).toContain("Правило «Ответ ночью» не отправило клиенту сообщение: в тексте номер карты, номер телефона");
    expect(t.alerts).toEqual([{ title: "Правило «Ответ ночью» не отправило сообщение: в тексте номер карты, номер телефона", body: "Айгерим: •••• 1111, +7 702 999 88 77" }]);
  });

  it("номер самого клиента и магазина в тексте правила — можно: сообщение уходит", async () => {
    const { t, a } = await two();
    const r = await t.service.sendAutomated(a.id, "Перезвоним на +7 701 123 45 67, наш WhatsApp: +7 700 555 66 77", { rule: "Ответ ночью" });
    expect(r?.status).toBe("sent");
    expect(t.sent).toEqual(["Перезвоним на +7 701 123 45 67, наш WhatsApp: +7 700 555 66 77"]);
    expect(t.alerts).toEqual([]);
  });

  it("пересылка: номер одного клиента другому — нельзя (до отправки хоть кому-то); номер получателя и магазина — можно", async () => {
    const { t, a, b } = await two();
    await expect(t.service.assertForwardable("Мой номер 8 701 123 45 67", [a.id, b.id])).rejects.toThrow("В сообщении номер телефона — переслать его нельзя");
    await expect(t.service.assertForwardable("Пишите на 8 701 123 45 67 или нам +7 700 555 66 77", [a.id])).resolves.toBeUndefined();
    await expect(t.service.assertForwardable("Ссылка: https://kaspi.kz/pay/abc", [a.id])).rejects.toBeInstanceOf(MessageActionError);
    await expect(t.service.assertForwardable("", [a.id, b.id])).resolves.toBeUndefined();
  });
});
