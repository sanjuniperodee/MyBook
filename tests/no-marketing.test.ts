import { describe, expect, it } from "vitest";
import { asksNoMessages, defaultBotConfig, type BotConfig } from "@/modules/messaging/domain";
import { BOT_ABANDON_MS, BOT_PAUSE_MS } from "@/modules/messaging/application";
import { BOT_CONFIG, inbound, setup } from "./doubles/botHarness";

/**
 * Защита номера WhatsApp (contacts-18): стоп-лист «Не писать первым». Клиент с отметкой пишет и получает ответы как
 * обычно, но бот не напоминает о себе, а правила автоматизаций ему не пишут. «Не пишите мне» ставит отметку само.
 */

const PHONE = "77011234567";
const SELL: BotConfig = { ...BOT_CONFIG, sell: { ...defaultBotConfig.sell, on: true, prepay: 10000, invoice: true, speaksAs: "assistant" } };

describe("просьба не писать (asksNoMessages)", () => {
  it("«не пишите мне», «больше не пишите», «стоп» отдельным сообщением, казахские — просьба", () => {
    for (const text of ["Не пишите мне", "больше не пишите пожалуйста", "Пожалуйста, не беспокойте", "Не пишите!", "Хватит мне писать", "отпишите меня от рассылки", "Удалите мой номер", "Стоп", "STOP", "Маған жазбаңыз", "енді жазбаныз", "Мазаламаңыз"]) {
      expect(asksNoMessages(text), text).toBe(true);
    }
  });

  it("казахский без казахских букв и «писать» в инфинитиве — тоже просьба", () => {
    for (const text of [
      "Маган жазбаныз",
      "Маган енди жазбаныз",
      "Мага жазбаныз",
      "Енди маган жазбаныз, рахмет",
      "Бұдан былай маған жазбаңыз",
      "Маған хабарлама жібермеңіз",
      "Не надо мне писать",
      "Прошу больше не писать",
      "Не нужно мне больше писать",
      "Не надо мне больше ничего присылать",
      "Больше не пишите мне, спасибо",
      "Не пишите мне больше 🙏",
      "Перестаньте мне писать",
      "Хватит писать мне сообщения",
      "Удалите меня из базы",
      "Удалите мой номер из рассылки, пожалуйста",
      "Больше не пишите на этот номер, пожалуйста",
      "Не пишите мне в ватсап",
    ]) {
      expect(asksNoMessages(text), text).toBe(true);
    }
  });

  it("обычные фразы со «стоп» и «не пишите» — не просьба: имя на обложке, звонки, «отпишитесь», передумала", () => {
    for (const text of ["Не пишите имя на обложке", "не звоните, пишите сюда", "Отпишитесь, как получите", "Стоп, я передумала, хочу печатную", "атын жазбаңыз кітапқа", "Хочу книгу для мамы"]) {
      expect(asksNoMessages(text), text).toBe(false);
    }
  });

  it("просьба с продолжением — не просьба: писать в другое место, подождать, «хватит» в ответ на вопрос, номер страницы", () => {
    for (const text of [
      "Не пишите мне сюда, пишите в WhatsApp",
      "Пишите в WhatsApp, сюда не пишите",
      "Не пишите мне в ватсап, пишите в телеграм",
      "Не пишите мне на почту, лучше в ватсап",
      "Не пиши мне пока, я на работе, вечером отвечу",
      "Я на работе, пока не пишите",
      "Хватит",
      "Хватит!",
      "Хватит присылать варианты, беру второй",
      "Удалите номер страницы внизу",
      "Почему вы мне не пишите",
      "Почему вы мне не пишите?",
      "Не надо писать, я сама позвоню",
      "Не беспокойтесь, всё получила",
      "Маған жазба жіберіңіз",
      "Маган жазбаныз, ватсапка жазыныз",
    ]) {
      expect(asksNoMessages(text), text).toBe(false);
    }
  });
});

describe("стоп-лист «Не писать первым» в инбоксе", () => {
  it("входящие проходят как обычно: заявка, «ждёт ответа», уведомление; ответ менеджера уходит", async () => {
    const t = setup({ noMarketing: [PHONE] });
    await t.service.ingest(inbound({ text: "Здравствуйте, хочу книгу" }));
    expect(t.deals).toHaveLength(1);
    expect(t.conv().unread).toBe(1);
    expect(t.conv().closed).toBeFalsy();
    expect(t.conv().awaiting).not.toBeNull();
    expect(t.notified.map((n) => n.title)).toEqual(["Айгерим · WhatsApp"]);
    expect(await t.service.send(t.conv().id, "Добрый день!", "m1")).toMatchObject({ status: "sent" });
  });

  it("сообщение правила не уходит — ни напоминание, ни автоответ; без отметки — уходит", async () => {
    const t = setup({ noMarketing: [PHONE] });
    await t.service.ingest(inbound());
    expect(await t.service.sendAutomated(t.conv().id, "Ответим утром", { rule: "Ночной автоответ" })).toBeNull();
    expect(t.sent).toEqual([]);
    const free = setup();
    await free.service.ingest(inbound());
    expect(await free.service.sendAutomated(free.conv().id, "Ответим утром")).toMatchObject({ status: "sent" });
  });

  it("бот отвечает на сообщения клиента, но не напоминает о себе: после предложения тишина и через 12 часов итог", async () => {
    const t = setup({ bot: "always", config: SELL, noMarketing: [PHONE] });
    for (const text of ["Здравствуйте", "для мамы", "др"]) {
      await t.service.ingest(inbound({ text }));
      await t.advance(BOT_PAUSE_MS + 1);
    }
    expect(t.sent).toHaveLength(3);
    expect(t.sent[2]).toContain("Оформляем?");
    await t.advance(BOT_ABANDON_MS + 1);
    await t.advance(3 * 3_600_000);
    expect(t.sent).toHaveLength(3); // без «Успели посмотреть?»
    await t.advance(12 * 3_600_000 + 1);
    expect(t.sent).toHaveLength(3);
    expect(t.conv().botState).toMatchObject({ phase: "done", outcome: "offered" });
    expect(t.notified.map((n) => n.title)).toContain("Бот сделал предложение, клиент молчит: Айгерим");
  });

  it("«не пишите мне» — номер сам попадает в «Не писать первым», в чате заметка менеджеру; повтор — без второй заметки", async () => {
    const t = setup();
    await t.service.ingest(inbound({ text: "Здравствуйте" }));
    expect(await t.service.noMarketing(PHONE)).toBe(false);
    await t.service.ingest(inbound({ text: "Больше не пишите мне" }));
    expect(t.blocklist.get(PHONE)).toEqual({ reason: "no_marketing", note: "Клиент написал: «Больше не пишите мне»", by: null });
    const notes = () => t.msgs.filter((m) => m.internal).map((m) => m.text);
    expect(notes()).toEqual([expect.stringContaining("Клиент попросил больше не писать — номер в стоп-листе «Не писать первым»")]);
    await t.service.ingest(inbound({ text: "стоп" }));
    expect(notes()).toHaveLength(1);
    // Входящие не блокируются — клиент не спам.
    expect(await t.service.isBlocked(PHONE)).toBe(false);
    expect(await t.service.sendAutomated(t.conv().id, "Скидка 10% до пятницы")).toBeNull();
  });

  it("«хватит» в ответ менеджеру и «не пишите сюда, пишите в WhatsApp» номер не отмечают; «маган енди жазбаныз» — отмечает", async () => {
    const t = setup();
    await t.service.ingest(inbound({ text: "Здравствуйте" }));
    await t.service.send(t.conv().id, "Ещё фото добавить?", "m1");
    for (const text of ["Хватит", "Не пишите мне сюда, пишите в WhatsApp", "Хватит присылать варианты, беру второй"]) await t.service.ingest(inbound({ text }));
    expect(await t.service.noMarketing(PHONE)).toBe(false);
    expect(t.msgs.filter((m) => m.internal)).toEqual([]);
    await t.service.ingest(inbound({ text: "Маган енди жазбаныз" }));
    expect(t.blocklist.get(PHONE)).toMatchObject({ reason: "no_marketing", note: "Клиент написал: «Маган енди жазбаныз»" });
  });

  it("кнопка в карточке: все номера карточки и её диалогов; «можно писать» снимает только эту отметку, спам остаётся", async () => {
    const t = setup();
    await t.service.ingest(inbound());
    const dealId = t.conv().dealId!;
    expect(await t.service.noMarketingFor({ dealId, phones: ["8 707 111 22 33"] })).toBe(false);
    expect(await t.service.setNoMarketing({ dealId, phones: ["8 707 111 22 33", null] }, true, "m1", "Сделка №5")).toEqual(["77071112233", PHONE]);
    expect(t.blocklist.get("77071112233")).toEqual({ reason: "no_marketing", note: "Сделка №5", by: "m1" });
    expect(await t.service.noMarketingFor({ dealId, phones: [] })).toBe(true);
    await t.service.blockPhone("+7 707 111 22 33", "spam", "boss", null);
    await t.service.setNoMarketing({ dealId, phones: ["87071112233"] }, false, "m1");
    expect(t.blocklist.get(PHONE)).toBeUndefined();
    expect(t.blocklist.get("77071112233")?.reason).toBe("spam");
    await expect(t.service.setNoMarketing({ phones: ["123"] }, true, "m1")).rejects.toThrow("нет ни номера телефона, ни переписки");
  });
});
