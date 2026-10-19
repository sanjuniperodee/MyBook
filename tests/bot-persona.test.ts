import { describe, expect, it } from "vitest";
import { coachPrompt, defaultBotConfig, parseBotConfig, type BotConfig } from "@/modules/messaging/domain";
import { botText, faqFor, revoiceConfig } from "@/modules/messaging/domain/botConfig";
import { introLine, personaProblems } from "@/modules/messaging/domain/botSeller";
import { BOT_PAUSE_MS, type BotSellerModel } from "@/modules/messaging/application";
import { BOT_CONFIG, inbound, setup } from "./doubles/botHarness";

/**
 * Бот пишет как сам менеджер (решение владельца 18.10: «пусть бот больше не притворяется Айгерим, помощницей Марата —
 * он сам Марат»): представляется его именем, о себе — от первого лица, без «передаю Марату» и «передала менеджеру».
 * Честность остаётся: на прямой вопрос «это бот?» он не утверждает, что живой человек.
 */
const ans = (p: Record<string, unknown> = {}) => ({
  summary: "",
  language: "ru",
  stage: "discovery",
  action: "reply",
  reply: "Для кого будет книга?",
  handoff_reason: "none",
  fields: { recipient: "", occasion: "" },
  event_date: "",
  plan: "unknown",
  asked_to_order: false,
  agreed: false,
  agreed_quote: "",
  ...p,
});

type Req = Parameters<BotSellerModel["complete"]>[0];
function fakeModel(script: Record<string, unknown>[]) {
  const calls: Req[] = [];
  const model: BotSellerModel = {
    configured: async () => true,
    complete: async (req) => {
      calls.push(req);
      const next = script.shift();
      if (!next) throw new Error("модель: сценарий кончился");
      return { text: JSON.stringify(next) };
    },
  };
  return { model, calls };
}

const marat = (p: Partial<BotConfig["sell"]> = {}): BotConfig => ({
  ...BOT_CONFIG,
  waitMinutes: 3,
  sell: { ...defaultBotConfig.sell, on: true, engine: "ai", takeover: true, speaksAs: "manager", ...p },
});
const run = (t: ReturnType<typeof setup>) => t.advance(BOT_PAUSE_MS + 1);

describe("от чьего имени пишет бот", () => {
  it("по умолчанию — сам менеджер; старые настройки без поля — тоже; «помощница» сохраняется, если выбрана", () => {
    expect(defaultBotConfig.sell.speaksAs).toBe("manager");
    expect(parseBotConfig(JSON.stringify({ sell: { botName: "Айгерим", managerName: "Марат" } })).sell.speaksAs).toBe("manager");
    expect(parseBotConfig(JSON.stringify({ sell: { speaksAs: "assistant" } })).sell.speaksAs).toBe("assistant");
  });

  it("представление: своим именем, без «помощницы»; по-казахски — по-казахски", () => {
    const sell = { ...defaultBotConfig.sell, speaksAs: "manager" as const };
    expect(introLine(sell, "ru", true)).toBe("Здравствуйте! 😊 Меня зовут Марат.");
    expect(introLine(sell, "ru", false)).toBe("Это Марат 🙂");
    expect(introLine(sell, "kk", true)).toBe("Сәлеметсіз бе! 😊 Менің атым Марат.");
    expect(introLine(sell, "kk", false)).toBe("Менің атым Марат 🙂");
    expect(introLine({ ...sell, speaksAs: "assistant" }, "ru", true)).toContain("помощница менеджера Марата");
  });
});

describe("AI-продажник в образе самого менеджера", () => {
  it("инструкция: «Ты — Марат», от первого лица; без помощницы; честно на прямой вопрос «это бот?»", async () => {
    const { model, calls } = fakeModel([ans()]);
    const t = setup({ bot: "always", config: marat({ hidePrices: true }), seller: model });
    await t.service.ingest(inbound({ text: "Здравствуйте" }));
    await run(t);
    const system = calls[0].system;
    expect(system).toContain("Ты — Марат, менеджер по продажам");
    expect(system).toContain("«Меня зовут Марат»");
    expect(system).toContain("не утверждай, что ты живой человек");
    expect(system).toContain("AI-помощник");
    expect(system).toContain("Подберу вариант и напишу вам цену");
    expect(system).toContain("Наберу вам");
    expect(system).not.toMatch(/Ты — Айгерим|помощница менеджера|Передала Марату|в женском роде/);
  });

  it("модель забыла представиться — первое сообщение начинается с «Меня зовут Марат»", async () => {
    const { model } = fakeModel([ans({ reply: "Для кого хотите сделать книгу? 🎁" })]);
    const t = setup({ bot: "always", config: marat(), seller: model });
    await t.service.ingest(inbound({ text: "Здравствуйте! Хочу узнать стоимость." }));
    await run(t);
    expect(t.sent).toEqual(["Здравствуйте! 😊 Меня зовут Марат.", "Для кого хотите сделать книгу? 🎁"]);
  });

  it("по-казахски: забыла представиться — «Менің атым Марат»; представилась сама — второй раз не добавляется", async () => {
    const forgot = fakeModel([ans({ language: "kk", reply: "Кітапты кімге сыйлағыңыз келеді? 🎁" })]);
    const t = setup({ bot: "always", config: marat(), seller: forgot.model });
    await t.service.ingest(inbound({ text: "Сәлеметсіз бе, кітап жайлы білейін деп едім" }));
    await run(t);
    expect(t.sent).toEqual(["Сәлеметсіз бе! 😊 Менің атым Марат.", "Кітапты кімге сыйлағыңыз келеді? 🎁"]);

    const own = fakeModel([ans({ language: "kk", reply: "Сәлеметсіз бе! 😊 Менің атым Марат. Кітапты кімге сыйлағыңыз келеді?" })]);
    const t2 = setup({ bot: "always", config: marat(), seller: own.model });
    await t2.service.ingest(inbound({ text: "Сәлеметсіз бе" }));
    await run(t2);
    expect(t2.sent).toEqual(["Сәлеметсіз бе! 😊 Менің атым Марат. Кітапты кімге сыйлағыңыз келеді?"]);
    expect(own.calls[0].system).toContain("«Менің атым Марат»");
  });

  it("«передаю Марату» и «я помощница» — ответ не уходит, модель переписывает от первого лица", async () => {
    const { model, calls } = fakeModel([
      ans({ reply: "Это Марат 🙂 Передаю Марату — он подберёт вариант и напишет цену" }),
      ans({ reply: "Это Марат 🙂 Подберу вариант и напишу вам цену 🙌" }),
    ]);
    const t = setup({ bot: "always", config: marat(), seller: model });
    await t.service.ingest(inbound({ text: "Сколько стоит?" }));
    await run(t);
    expect(calls).toHaveLength(2);
    expect(JSON.stringify(calls[1])).toContain("ты и есть Марат");
    expect(t.sent.join("\n")).not.toContain("Передаю Марату");
    expect(t.sent.join("\n")).toContain("Подберу вариант и напишу вам цену");
  });

  it("проверка ответа: третье лицо и «помощник» — нарушение; представление и обращение к клиенту по имени Марат — нет", () => {
    const sell = { speaksAs: "manager" as const, managerName: "Марат" };
    for (const bad of ["Передаю Марату — он подберёт вариант", "Марат напишет вам цену", "Передала ваш вопрос менеджеру", "Я помощница Марата", "Менеджер свяжется с вами", "Маратқа жеткіздім"])
      expect(personaProblems(bad, sell), bad).not.toEqual([]);
    for (const ok of ["Здравствуйте! 😊 Меня зовут Марат.\n\nКому книга?", "Марат, подскажите, для кого книга?", "Менің атым Марат. Кітап кімге?", "Подберу вариант и напишу вам цену 🙌"])
      expect(personaProblems(ok, sell), ok).toEqual([]);
    expect(personaProblems("Передала Марату", { speaksAs: "assistant", managerName: "Марат" })).toEqual([]);
  });
});

describe("шаблонные тексты и ответы — голосом менеджера", () => {
  const manager = defaultBotConfig;
  const assistant = { ...defaultBotConfig, sell: { ...defaultBotConfig.sell, speaksAs: "assistant" as const } };

  it("«Передала менеджеру» → «Уточню и вернусь»; цену и счёт — «назову», «пришлю»; по-казахски тоже", () => {
    expect(botText(manager, "ru", "handoff")).toBe("Уточню и вернусь к вам в ближайшее время.");
    expect(botText(assistant, "ru", "handoff")).toBe("Передала ваш вопрос менеджеру — он свяжется с вами в ближайшее время.");
    expect(botText(manager, "ru", "agreed")).toContain("Пришлю счёт на предоплату");
    expect(botText(manager, "kk", "handoff")).toBe("Нақтылап, жақын арада хабарласамын.");
    expect(faqFor(manager, "price", "ru")).toContain("Точную сумму с учётом акции и доставки назову в ответе.");
    expect(faqFor(manager, "payment", "ru")).toContain("по счёту, который я пришлю");
    expect(faqFor(assistant, "price", "ru")).toContain("менеджер назовёт в ответе");
    for (const lang of ["ru", "kk"] as const)
      for (const key of Object.keys(defaultBotConfig.texts[lang]) as (keyof BotConfig["texts"]["ru"])[]) expect(botText(manager, lang, key), `${lang}.${key}`).not.toMatch(/Передала|поняла|получила|көмекші|менеджерге жеткіз/i);
  });

  it("свой текст владельца не трогаем; форма при переключении меняет только заводские тексты, туда и обратно", () => {
    const own = { ...manager, texts: { ...manager.texts, ru: { ...manager.texts.ru, handoff: "Минутку, гляну и отвечу 🙏" } } };
    expect(botText(own, "ru", "handoff")).toBe("Минутку, гляну и отвечу 🙏");
    const asManager = revoiceConfig(assistant, "manager");
    expect(asManager.sell.speaksAs).toBe("manager");
    expect(asManager.texts.ru.finish).toBe("Спасибо! Посмотрю ваши ответы и скоро напишу 🙌");
    expect(asManager.faq.price.text.ru).toContain("назову в ответе");
    const back = revoiceConfig(asManager, "assistant");
    expect(back.texts.ru.finish).toBe(defaultBotConfig.texts.ru.finish);
    expect(back.faq.price.text.ru).toBe(defaultBotConfig.faq.price.text.ru);
    expect(revoiceConfig(own, "assistant").texts.ru.handoff).toBe("Минутку, гляну и отвечу 🙏");
  });

  it("шаблонный бот (без модели) в образе менеджера: на «позвоните» — от первого лица", async () => {
    const t = setup({ bot: "always", config: { ...BOT_CONFIG, sell: { ...BOT_CONFIG.sell, speaksAs: "manager" } } });
    await t.service.ingest(inbound({ text: "Позвоните мне, пожалуйста" }));
    await run(t);
    expect(t.sent.join("\n")).not.toMatch(/Передала|помощни/);
  });
});

describe("работа над ошибками знает образ", () => {
  it("уроки — от первого лица менеджера; у помощницы — как раньше", () => {
    expect(coachPrompt({ conversations: [], lessons: [], botName: "Айгерим", managerName: "Марат", speaksAs: "manager" }).system).toContain("как сам менеджер Марат");
    expect(coachPrompt({ conversations: [], lessons: [], botName: "Айгерим", managerName: "Марат", speaksAs: "assistant" }).system).toContain("«Айгерим, помощница менеджера Марат»");
  });
});
