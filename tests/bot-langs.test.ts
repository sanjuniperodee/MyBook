import { describe, expect, it } from "vitest";
import { botText, defaultBotConfig, faqFor, parseBotConfig, questionFor } from "@/modules/messaging/domain/botConfig";
import { asksNoMessages, detectLang, faqIntents, handoffIntent, hasOrderIntent, isAck, langRequest, objectionKind } from "@/modules/messaging/domain/botNlu";
import { humanDate, whenText } from "@/modules/messaging/domain/bot";
import { announceFirst, cleanSellerReply, fixMixedScript, introLine, parseSellerDecision, sellerSchema } from "@/modules/messaging/domain/botSeller";
import { bookLink, findRecipient } from "@/modules/messaging/domain/botThemes";
import { materialsFor, type BotMaterial } from "@/modules/messaging/domain/botMaterials";

const TZ = "Asia/Almaty";

describe("бот: узбекский и английский", () => {
  it("язык сообщения: узбекская латиница и кириллица, английский, казахский и русский латиницей", () => {
    const cases: [string, string | null][] = [
      ["Здравствуйте, сколько стоит?", "ru"],
      ["Сәлеметсіз бе! Кітап қанша тұрады?", "kk"],
      ["Саламатсызба, канша турады? Шымкентке жеткизу бар ма", "kk"],
      ["Assalomu alaykum, kitob narxi qancha? O‘zbek tilida yozsa bo‘ladimi?", "uz"],
      ["Ассалому алайкум, китоб нархи қанча?", "uz"],
      ["Салом, менга китоб керак", "uz"],
      ["Ўзбекча ёзса бўладими", "uz"],
      ["Hi! How much is the book? Can I write it in English?", "en"],
      ["privet skolko stoit kniga", "ru"],
      ["salem kitap kansha", "kk"],
      ["ok", null],
      ["👍", null],
      ["15.12", null],
    ];
    for (const [t, l] of cases) expect([t, detectLang(t)]).toEqual([t, l]);
    expect(langRequest("Can we talk in English?")).toBe("en");
    expect(langRequest("o'zbek tilida yozing")).toBe("uz");
    expect(langRequest("можно на узбекском?")).toBe("uz");
  });

  it("намерения: цена, менеджер, звонок, оплатил, «не пишите», возражения и согласие", () => {
    expect(faqIntents("kitob narxi qancha?")).toContain("price");
    expect(faqIntents("How much is it?")).toContain("price");
    expect(faqIntents("How long does delivery take?")).toEqual(expect.arrayContaining(["delivery", "timing"]));
    expect(handoffIntent("menejer bilan gaplashsam bo'ladimi")).toBe("manager");
    expect(handoffIntent("Can I talk to a real person?")).toBe("manager");
    expect(handoffIntent("please call me")).toBe("call");
    expect(handoffIntent("I have already paid")).toBe("paid");
    expect(asksNoMessages("Don't text me anymore, please")).toBe(true);
    expect(asksNoMessages("menga boshqa yozmang")).toBe(true);
    expect(asksNoMessages("Don't write the name on the cover")).toBe(false);
    expect(objectionKind("juda qimmat ekan")).toBe("price");
    expect(objectionKind("I'll think about it")).toBe("later");
    expect(hasOrderIntent("Let's do it")).toBe(true);
    expect(hasOrderIntent("kelishdik, rasmiylashtiring")).toBe(true);
    expect(hasOrderIntent("not now, later")).toBe(false);
    expect(isAck("Rahmat")).toBe(true);
    expect(isAck("Thank you")).toBe(true);
  });

  it("продажник: язык ответа модели — любой из четырёх, схема его разрешает", () => {
    const schema = sellerSchema([]) as unknown as { properties: { language: { enum: string[] } } };
    expect(schema.properties.language.enum).toEqual(["ru", "kk", "uz", "en"]);
    for (const language of ["uz", "en", "kk"]) expect(parseSellerDecision({ action: "reply", reply: "Salom", language }, [], new Date("2026-11-24T08:00:00Z"), TZ)!.lang).toBe(language);
    expect(parseSellerDecision({ action: "reply", reply: "Привет", language: "de" }, [], new Date("2026-11-24T08:00:00Z"), TZ)!.lang).toBe("ru");
  });

  it("представление и заводские тексты — на языке клиента, узбекский — алфавитом ответа", () => {
    const sell = { botName: "Айгерим", managerName: "Марат", speaksAs: "manager" as const };
    expect(introLine(sell, "uz", true)).toBe("Assalomu alaykum! 😊 Mening ismim Marat.");
    expect(introLine(sell, "uz", true, true)).toBe("Ассалому алайкум! 😊 Менинг исмим Марат.");
    expect(introLine(sell, "en", true)).toBe("Hello! 😊 My name is Marat.");
    expect(introLine({ ...sell, speaksAs: "assistant" }, "en", false)).toBe("This is Aygerim, Marat’s assistant 🙂");
    const config = parseBotConfig(JSON.stringify({ ...defaultBotConfig, texts: { ...defaultBotConfig.texts, ru: { ...defaultBotConfig.texts.ru, handoff: "Свой текст владельца" } } }));
    expect(botText(config, "ru", "handoff")).toBe("Свой текст владельца");
    expect(botText(config, "uz", "handoff")).toBe("Aniqlab, tez orada sizga qaytaman.");
    expect(botText(config, "en", "voice")).toMatch(/^I’ll listen to your voice message/);
    // Шаблоны из настроек (вопросы, частые вопросы) — только ru и kk: узбекам и англоязычным — русский.
    expect(questionFor(config.questions[0], "en")).toBe(config.questions[0].text.ru);
    expect(faqFor(config, "language", "uz")).toBe(faqFor(config, "language", "ru"));
    expect(Object.keys(parseBotConfig("{}").texts)).toEqual(["ru", "kk"]);
  });

  it("даты и «когда ответит менеджер» — по-узбекски и по-английски", () => {
    expect(humanDate("2026-12-01", "uz")).toBe("1-dekabr");
    expect(humanDate("2026-12-01", "en")).toBe("1 December");
    expect(whenText(new Date("2026-11-25T04:00:00Z"), new Date("2026-11-24T18:00:00Z"), "uz", TZ)).toBe("ertaga soat 09:00 dan boshlab");
    expect(whenText(new Date("2026-11-25T04:00:00Z"), new Date("2026-11-24T18:00:00Z"), "en", TZ)).toBe("tomorrow from 09:00");
  });

  it("ссылка — с префиксом языка сайта, материалы — русские", () => {
    const site = { url: "https://mybooks.kz", registrationOpen: true, landings: [] };
    const r = findRecipient("маме", { themes: ["mom"] })!;
    expect(bookLink(r, site, "uz", false)?.url).toBe("https://mybooks.kz/uz/register?theme=mom");
    expect(bookLink(r, site, "en", false)?.url).toBe("https://mybooks.kz/en/register?theme=mom");
    const m = (id: string, lang: BotMaterial["lang"], kind: BotMaterial["kind"] = "document") => ({ id, kind, key: id, name: id, mime: "application/pdf", size: 1, caption: "", lang, about: "", on: true }) as BotMaterial;
    expect(materialsFor([m("ru", "ru"), m("kk", "kk")], "en").map((x) => x.id)).toEqual(["ru"]);
  });
});

describe("продажник: доводка ответа кодом (живая проверка 24.11)", () => {
  it("латинская буква внутри кириллического слова — кириллицей, и наоборот", () => {
    expect(fixMixedScript("мұқабaны өзіңіз таңдайсыз")).toBe("мұқабаны өзіңіз таңдайсыз");
    expect(fixMixedScript("kitоb tayyor")).toBe("kitob tayyor");
    expect(cleanSellerReply("Фото и мұқабaны выбираете сами, PDF — тоже")).toBe("Фото и мұқабаны выбираете сами, PDF — тоже");
  });
  it("подводка «Отправляю…» — прямо перед подборкой, после представления", () => {
    const reply = "Здравствуйте! 😊 Меня зовут Марат.\n\nОтличная идея ❤️ Успеваем к 20 декабря.\n\nОтправляю, как выглядят наши книги 😊\n\nОзнакомьтесь, пожалуйста 🙌";
    expect(announceFirst(reply, 1).split("\n\n")).toEqual(["Здравствуйте! 😊 Меня зовут Марат.", "Отправляю, как выглядят наши книги 😊", "Отличная идея ❤️ Успеваем к 20 декабря.", "Ознакомьтесь, пожалуйста 🙌"]);
    expect(announceFirst("Кітаптарымыз қалай көрінетінін жіберемін 😊\n\nҚарап шығыңыз", 0)).toBe("Кітаптарымыз қалай көрінетінін жіберемін 😊\n\nҚарап шығыңыз");
  });
});

describe("продажник: суммы, согласие и имя латиницей", () => {
  it("суммы с разрядами через запятую и точку («39,000 ₸») видит проверка", async () => {
    const { amountsIn } = await import("@/modules/messaging/domain/botSeller");
    expect(amountsIn("A printed hardcover book starts from 39,000 ₸.")).toEqual([39000]);
    expect(amountsIn("от 39.000 тенге, предоплата 10 000 ₸")).toEqual([39000, 10000]);
    expect(amountsIn("1,000,000 KZT")).toEqual([1000000]);
    expect(amountsIn("15.12.2026, 2,5 часа, 0-0-12, в 09:00")).toEqual([]);
  });
  it("имя менеджера латиницей в узбекском и английском представлении", async () => {
    const { latinName, withoutGreeting } = await import("@/modules/messaging/domain/botSeller");
    expect(latinName("Марат")).toBe("Marat");
    expect(latinName("Айгерим")).toBe("Aygerim");
    expect(introLine({ botName: "Айгерим", managerName: "Марат", speaksAs: "manager" }, "uz", true)).toBe("Assalomu alaykum! 😊 Mening ismim Marat.");
    expect(introLine({ botName: "Айгерим", managerName: "Марат", speaksAs: "manager" }, "en", true)).toBe("Hello! 😊 My name is Marat.");
    expect(withoutGreeting("History of your family — that's a great idea")).toBe("History of your family — that's a great idea");
    expect(withoutGreeting("Hi! 😊 Who is the book for?")).toBe("Who is the book for?");
  });
});

describe("продажник: «Давайте, как оплатить?» — согласие", () => {
  it("вопрос об оплате после согласия не мешает счёту; другой вопрос и оговорка — мешают", async () => {
    const { invoiceBlocker, newSellerAiState } = await import("@/modules/messaging/domain/botSeller");
    const prev = { ...newSellerAiState(), closeAsked: true, priceQuoted: true };
    const d = (agreedQuote: string) => ({ agreed: true, plan: "hardcover", agreedQuote }) as Parameters<typeof invoiceBlocker>[0];
    expect(invoiceBlocker(d("Давайте, как оплатить?"), prev, "Давайте, как оплатить?", true)).toBeNull();
    expect(invoiceBlocker(d("Let's do it, how do I pay?"), prev, "Looks great. Let's do it, how do I pay?", true)).toBeNull();
    expect(invoiceBlocker(d("Как оплатить?"), prev, "Как оплатить?", true)).toBe("quote_not_agreement");
    expect(invoiceBlocker(d("Давайте, а доставка есть?"), prev, "Давайте, а доставка есть?", true)).toBe("quote_not_agreement");
    expect(invoiceBlocker(d("давайте уточню у мужа, куда платить?"), prev, "давайте уточню у мужа, куда платить?", true)).toBe("quote_not_agreement");
  });
});

describe("продажник: модель забыла текст ответа к подборке", () => {
  it("send_materials без reply — заводская подводка на языке клиента, а не «не по схеме»", () => {
    const at = new Date("2026-11-24T08:00:00Z");
    expect(parseSellerDecision({ action: "reply", send_materials: true, language: "kk" }, [], at, TZ)!.reply).toMatch(/^Кітаптарымыз қалай көрінетінін/);
    expect(parseSellerDecision({ action: "reply", send_materials: true }, [], at, TZ)!.reply).toMatch(/^Отправляю, как выглядят наши книги/);
    expect(parseSellerDecision({ action: "reply", send_materials: false }, [], at, TZ)).toBeNull();
  });
});
