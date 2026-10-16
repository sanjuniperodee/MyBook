import { describe, expect, it } from "vitest";
import { defaultBotConfig, matchOption, parseBotConfig, parseDateAnswer, type BotConfig } from "@/modules/messaging/domain/botConfig";
import { detectLang, faqIntents, handoffIntent, isDontKnow, langRequest, looksLikeContinuation } from "@/modules/messaging/domain/botNlu";
import { bookLink, findRecipient } from "@/modules/messaging/domain/botThemes";
import { catalogVars, pricesOutsideCatalog, type BotCatalog } from "@/modules/messaging/domain/botFaq";
import { botSummary, botTurn, newBotState, startBlocker, type BotEnv, type BotInput, type BotState } from "@/modules/messaging/domain/botEngine";
import { humanDate, safeName, whenText, type DealField } from "@/modules/messaging/domain/bot";

/** 17.10.2026, 00:50 по Алматы (UTC+5) — как в разборе прода: «сегодня» по магазину уже 17-е, по UTC ещё 16-е. */
const night = new Date("2026-10-16T19:50:00Z");
const day = new Date("2026-10-17T06:00:00Z"); // 11:00 Алматы, суббота
const TZ = "Asia/Almaty";

const OCCASIONS = ["Годовщина", "День рождения", "14 февраля", "8 марта", "Новый год", "Свадьба", "Юбилей родителей", "Выпускной", "Другой повод"];
const FORMATS = ["Печатная", "Электронная", "Пока не знает"];
/** Поля сделки как на проде. */
const fields: DealField[] = [
  { key: "recipient", label: "Для кого", type: "text", options: [] },
  { key: "occasion", label: "Повод", type: "select", options: OCCASIONS },
  { key: "event_date", label: "Дата события", type: "date", options: [] },
  { key: "format", label: "Формат", type: "select", options: FORMATS },
];
const catalog: BotCatalog = {
  plans: [
    { id: "digital", price: 9900 },
    { id: "hardcover", price: 30000, extraCopyPrice: 17900 },
    { id: "premium", price: 35000, hidden: true },
  ],
  delivery: [
    { id: "courier", price: 3500 },
    { id: "post", price: 3500 },
    { id: "pickup", price: 0 },
  ],
  addons: [
    { id: "express", price: 5000 },
    { id: "giftwrap", price: 5000 },
  ],
  productionDays: { standard: "5–7", premium: "3–4" },
};
const site = { url: "https://mybook.kz", registrationOpen: false, themes: ["love", "mom", "dad", "friend", "autobiography", "blank"], landings: ["kniga-mame", "kniga-pape", "podarok-muzhu", "kniga-drugu", "podarok-zhene"] };

describe("бот: даты из реальных ответов", () => {
  it("слитно, с сокращениями, по-казахски и с годом", () => {
    expect(parseDateAnswer("4Ноябрь", day, TZ)).toBe("2026-11-04");
    expect(parseDateAnswer("у нас в 24ноябре годовщина", day, TZ)).toBe("2026-11-24");
    expect(parseDateAnswer("21 окт", day, TZ)).toBe("2026-10-21");
    expect(parseDateAnswer("5ноября", day, TZ)).toBe("2026-11-05");
    expect(parseDateAnswer("15 қараша", day, TZ)).toBe("2026-11-15");
    expect(parseDateAnswer("қарашаның 15-і", day, TZ)).toBe("2026-11-15");
    expect(parseDateAnswer("15-го декабря 2027", day, TZ)).toBe("2027-12-15");
    expect(parseDateAnswer("к 3.02", day, TZ)).toBe("2027-02-03");
  });

  it("«15 мама» — не май; цены и рассрочка — не даты", () => {
    expect(parseDateAnswer("15 мама", day, TZ)).toBeNull();
    expect(parseDateAnswer("20.000", day, TZ)).toBeNull();
    expect(parseDateAnswer("рассрочка 0-0-12", day, TZ)).toBeNull();
    expect(parseDateAnswer("60-200 страниц", day, TZ)).toBeNull();
  });

  it("относительные даты — по календарю магазина, а не сервера", () => {
    // 00:50 17 октября в Алматы: «сегодня» — 17-е, «завтра» — 18-е (по UTC было бы 16-е и 17-е).
    expect(parseDateAnswer("сегодня", night, TZ)).toBe("2026-10-17");
    expect(parseDateAnswer("завтра", night, TZ)).toBe("2026-10-18");
    expect(parseDateAnswer("ертең", night, TZ)).toBe("2026-10-18");
    expect(parseDateAnswer("послезавтра", night, TZ)).toBe("2026-10-19");
    expect(parseDateAnswer("через неделю", night, TZ)).toBe("2026-10-24");
    expect(parseDateAnswer("через 2 недели", night, TZ)).toBe("2026-10-31");
    expect(parseDateAnswer("бір аптадан кейін", night, TZ)).toBe("2026-10-24");
    expect(parseDateAnswer("в субботу", night, TZ)).toBe("2026-10-24"); // 17-е — суббота, значит следующая
    expect(parseDateAnswer("к Новому году", night, TZ)).toBe("2026-12-31");
  });
});

describe("бот: варианты списка", () => {
  it("«8 марта» — это 8 марта, а не вариант 8; голая цифра — номер варианта", () => {
    expect(matchOption("8 марта", OCCASIONS)).toBe("8 марта");
    expect(matchOption("8", OCCASIONS)).toBe("Выпускной");
    expect(matchOption("№2", OCCASIONS)).toBe("День рождения");
    expect(matchOption("12", OCCASIONS)).toBeNull();
  });

  it("синонимы и казахский: др, туған күн, юбилей, годовщина свадьбы", () => {
    expect(matchOption("др", OCCASIONS)).toBe("День рождения");
    expect(matchOption("Туған күнге", OCCASIONS)).toBe("День рождения");
    expect(matchOption("туган кунге", OCCASIONS)).toBe("День рождения");
    expect(matchOption("на юбилей", OCCASIONS)).toBe("Юбилей родителей");
    expect(matchOption("на годовщину свадьбы", OCCASIONS)).toBe("Годовщина");
    expect(matchOption("родителям на годовщину", OCCASIONS)).toBe("Годовщина");
    expect(matchOption("просто так", OCCASIONS)).toBe("Другой повод");
    expect(matchOption("жаңа жылға", OCCASIONS)).toBe("Новый год");
    expect(matchOption("непонятно что", OCCASIONS)).toBeNull();
  });

  it("формат: бумажная, твёрдая обложка, pdf, «не знаю»", () => {
    expect(matchOption("pdf", FORMATS)).toBe("Электронная");
    expect(matchOption("бумажная", FORMATS)).toBe("Печатная");
    expect(matchOption("твердая обложка", FORMATS)).toBe("Печатная");
    expect(matchOption("не знаю", FORMATS)).toBe("Пока не знает");
    expect(matchOption("әлі білмеймін", FORMATS)).toBe("Пока не знает");
    expect(matchOption("қатты мұқабалы", FORMATS, { labels: ["Қатты мұқабалы", "Электрондық", "Әзірге білмеймін"] })).toBe("Печатная");
  });

  it("strict — без номеров и угадывания по началу слова", () => {
    expect(matchOption("2", OCCASIONS, { strict: true })).toBeNull();
    expect(matchOption("на день рождения", OCCASIONS, { strict: true })).toBe("День рождения");
  });
});

describe("бот: язык и намерения", () => {
  it("казахский по буквам и по словам без казахских букв", () => {
    expect(detectLang("Сәлеметсіз бе")).toBe("kk");
    expect(detectLang("саламатсыз ба канша турады")).toBe("kk");
    expect(detectLang("Здравствуйте! Хочу узнать стоимость.")).toBe("ru");
    expect(detectLang("👍")).toBeNull();
    expect(langRequest("а можно на казахском?")).toBe("kk");
    expect(langRequest("орысша жазыңызшы")).toBe("ru");
  });

  it("вопросы клиентов с прода", () => {
    expect(faqIntents("Здравствуйте! Хочу узнать стоимость.")).toEqual(["price"]);
    expect(faqIntents("сколько стоит со скидкой")).toEqual(["price"]);
    expect(faqIntents("20 000 — это общая стоимость или предоплата?")).toEqual(["price", "payment"]);
    expect(faqIntents("сколько доставка до Актобе")).toEqual(["delivery"]);
    expect(faqIntents("доставка оплачивается отдельно?")).toEqual(["delivery"]);
    expect(faqIntents("успеем до 1 ноября?")).toEqual(["timing"]);
    expect(faqIntents("қанша күнде дайын болады")).toEqual(["timing"]);
    expect(faqIntents("неден бастаймыз")).toEqual(["how"]);
    expect(faqIntents("с чего начинаем")).toEqual(["how"]);
    expect(faqIntents("Бағасы қанша?")).toEqual(["price"]);
    expect(faqIntents("Например: для мамы")).toEqual([]);
  });

  it("просьбы позвать человека, «не знаю», продолжение старого разговора", () => {
    expect(handoffIntent("можете позвонить?")).toBe("call");
    expect(handoffIntent("қоңырау шалыңызшы")).toBe("call");
    expect(handoffIntent("я оплатила")).toBe("paid");
    expect(handoffIntent("скиньте реквизиты")).toBe("pay");
    expect(handoffIntent("позовите менеджера")).toBe("manager");
    expect(handoffIntent("для мамы")).toBeNull();
    expect(isDontKnow("пока не знаю")).toBe(true);
    expect(looksLikeContinuation("Маме")).toBe(true);
    expect(looksLikeContinuation("Ок спасибо")).toBe(true);
    expect(looksLikeContinuation("Здравствуйте")).toBe(false);
    expect(looksLikeContinuation("Хочу книгу")).toBe(false);
    expect(looksLikeContinuation("Цена?")).toBe(false);
  });
});

describe("бот: для кого → тема и ссылка", () => {
  it("русский и казахский, автобиография и своя книга", () => {
    expect(findRecipient("для мамы", { themes: site.themes })?.theme).toBe("mom");
    expect(findRecipient("әкеме туған күнге", { themes: site.themes })).toMatchObject({ key: "dad", theme: "dad" });
    expect(findRecipient("Мужу на годовщину", { themes: site.themes })).toMatchObject({ key: "husband", theme: "love", label: { ru: "Мужу" } });
    expect(findRecipient("хочу записать историю дедушки", { themes: site.themes })?.theme).toBe("autobiography");
    expect(findRecipient("общую — мы молодая семья", { themes: site.themes })?.theme).toBe("blank");
    expect(findRecipient("5", { themes: site.themes, menu: true })?.theme).toBe("autobiography");
    // Режимы ещё не вышли на сайте — темы нет, подпись есть.
    expect(findRecipient("о себе", { themes: ["love", "mom", "dad", "friend"] })).toMatchObject({ theme: null, label: { ru: "О себе (автобиография)" } });
    // Уверенная форма: «мама» в именительном — не получатель («я мама Айгерим»).
    expect(findRecipient("я мама Айгерим", { themes: site.themes, strong: true })).toBeNull();
  });

  it("ссылка: регистрация закрыта — пример книги, открыта — начать книгу, клиент с аккаунтом — новая книга", () => {
    const mom = findRecipient("маме", { themes: site.themes })!;
    expect(bookLink(mom, site, "ru", false)).toEqual({ url: "https://mybook.kz/kniga/kniga-mame", kind: "example" });
    expect(bookLink(mom, site, "kk", false)?.url).toBe("https://mybook.kz/kk/kniga/kniga-mame");
    expect(bookLink(mom, { ...site, registrationOpen: true }, "ru", false)).toEqual({ url: "https://mybook.kz/register?theme=mom", kind: "start" });
    expect(bookLink(mom, site, "ru", true)?.url).toBe("https://mybook.kz/books/new?theme=mom");
    expect(bookLink(findRecipient("себе", { themes: site.themes })!, site, "ru", false)).toBeNull();
  });
});

describe("бот: цены только из тарифов", () => {
  it("переменные по-русски и по-казахски, скрытый тариф пуст", () => {
    const ru = catalogVars(catalog, "ru");
    expect(ru["цена.печатная"]).toMatch(/^30\s000 ₸$/u);
    expect(ru["доставка.самовывоз"]).toBe("бесплатно");
    expect(catalogVars(catalog, "kk")["доставка.самовывоз"]).toBe("тегін");
    expect(ru["цена.премиум"]).toBe("");
  });

  it("число, похожее на цену, которого нет в тарифах, — ошибка; переменные и сроки — можно", () => {
    expect(pricesOutsideCatalog("Книга 40 000 ₸, сегодня 20 000", catalog)).toEqual(["40 000 ₸", "20 000"]);
    expect(pricesOutsideCatalog("Скидка 25%", catalog)).toEqual(["25%"]);
    expect(pricesOutsideCatalog("Печатная — {цена.печатная}, это 30 000 ₸; печать 5–7 дней, к 8 марта", catalog)).toEqual([]);
  });
});

describe("бот: имя и время", () => {
  it("имя без эмодзи; пустое — без имени", () => {
    expect(safeName("🤍")).toBe("");
    expect(safeName("айгерим🌸 Б.")).toBe("Айгерим");
    expect(safeName("Aigerim", "Айгерим Беккали")).toBe("Айгерим");
  });

  it("когда ответит менеджер — по-русски и по-казахски", () => {
    const start = new Date("2026-10-17T04:00:00Z"); // 09:00 Алматы
    expect(whenText(start, night, "ru", TZ)).toBe("сегодня с 09:00");
    expect(whenText(start, night, "kk", TZ)).toBe("бүгін сағат 09:00-ден бастап");
    expect(whenText(new Date("2026-10-19T04:30:00Z"), day, "ru", TZ)).toBe("в понедельник с 09:30");
    expect(whenText(new Date("2026-10-19T04:30:00Z"), day, "kk", TZ)).toBe("дүйсенбі күні сағат 09:30-дан бастап");
    expect(whenText(new Date("2026-10-18T04:00:00Z"), day, "kk", TZ)).toBe("ертең сағат 09:00-ден бастап");
    expect(humanDate("2026-11-21", "ru", true)).toBe("21 ноября 2026, сб");
    expect(humanDate("2026-11-21", "kk")).toBe("21 қараша");
  });
});

// ─── ход бота ──────────────────────────────────────────────────────────────

let seq = 0;
const msg = (text: string, type = "text"): BotInput => ({ id: `m${++seq}`, text, type, at: day });
const env = (p: Partial<BotEnv> = {}): BotEnv => ({
  config: defaultBotConfig,
  fields,
  dealValues: {},
  now: day,
  tz: TZ,
  workTime: true,
  nextWorkStart: day,
  catalog,
  site,
  client: { known: false, locale: null },
  name: "Айгерим",
  ...p,
});

/** Диалог по ходам: каждый ход — сообщения клиента подряд; возвращает ответы бота и итоговое состояние. */
function talk(turns: (string | BotInput)[][], e: BotEnv = env()) {
  let state: BotState = newBotState(day, true);
  const all: BotInput[] = [];
  const replies: (string | null)[] = [];
  let fieldsSet: Record<string, string | number> = {};
  for (const t of turns) {
    all.push(...t.map((x) => (typeof x === "string" ? msg(x) : x)));
    const r = botTurn(state, all, e);
    state = r.state;
    replies.push(r.reply);
    fieldsSet = { ...fieldsSet, ...r.fields };
  }
  return { state, replies, fields: fieldsSet };
}

describe("бот: сценарии", () => {
  it("«Хочу узнать стоимость» (45% первых сообщений): приветствие, ответ о цене без выдуманных цифр и первый вопрос", () => {
    const { replies, state } = talk([["Здравствуйте! Хочу узнать стоимость."]]);
    expect(replies[0]).toContain("Здравствуйте, Айгерим!");
    expect(replies[0]).toContain("Стоимость зависит от формата книги");
    expect(replies[0]).toContain("Для кого будет книга?");
    expect(replies[0]).toContain("5 — о себе или о близком с его слов (автобиография)");
    expect(replies[0]).toContain("6 — своя книга с нуля");
    expect(replies[0]).not.toMatch(/\d{2}\s?\d{3}/);
    expect(state).toMatchObject({ phase: "active", asking: "recipient", faq: ["price"], lang: "ru" });
  });

  it("всё в одном сообщении: заполняет три поля, подтверждает, спрашивает только формат и даёт пример книги", () => {
    const { replies, fields: f, state } = talk([["Здравствуйте, нужна книга маме на юбилей 15 ноября"]]);
    expect(f).toEqual({ recipient: "Маме", occasion: "Юбилей родителей", event_date: "2026-11-15" });
    expect(replies[0]).toContain("Поняла: маме, юбилей родителей, 15 ноября.");
    expect(replies[0]).toContain("https://mybook.kz/kniga/kniga-mame");
    expect(replies[0]).toContain("Какая книга нужна");
    expect(state.theme).toBe("mom");
  });

  it("казахский клиент: всё по-казахски, в CRM — значения на русском, ответ «туған күнге» понят", () => {
    const { replies, fields: f, state } = talk([["Сәлеметсіз бе"], ["әкеме"], ["Туған күнге"], ["15 қараша"], ["қатты мұқабалы"]]);
    expect(state.lang).toBe("kk");
    expect(replies[0]).toContain("Сәлеметсіз бе, Айгерим!");
    expect(replies[0]).toContain("Кітап кімге арналады?");
    expect(replies[1]).toContain("Қандай мерекеге сыйлайсыз?");
    expect(replies[1]).toContain("2 — Туған күн");
    expect(f).toEqual({ recipient: "Папе", occasion: "День рождения", event_date: "2026-11-15", format: "Печатная" });
    expect(replies[4]).toContain("Рақмет!");
    expect(state.outcome).toBe("finished");
  });

  it("дата в вопросе о сроках — та самая дата; вариант в вопросе («электронная есть?») — не выбор", () => {
    const { replies, fields: f } = talk([["Здравствуйте, успеете к 1 ноября? Электронная есть?"]]);
    expect(f).toEqual({ event_date: "2026-11-01" });
    expect(replies[0]).toContain("Печать занимает 5–7 рабочих дней");
    expect(replies[0]).toContain("Поняла: 1 ноября.");
  });

  it("«отцу на день рождения» в ответ на «для кого» — повод не спрашивается второй раз", () => {
    const { replies, fields: f } = talk([["Здравствуйте"], ["отцу на день рождения"]]);
    expect(f).toEqual({ recipient: "Папе", occasion: "День рождения" });
    expect(replies[1]).toContain("К какой дате нужна книга?");
    expect(replies[1]).not.toContain("По какому поводу");
  });

  it("непонятный ответ: один переспрос с вариантами, потом сохраняет как написано и идёт дальше", () => {
    const { replies, state } = talk([["Здравствуйте"], ["маме"], ["ну такое"], ["сложно сказать что-то"]]);
    expect(replies[2]).toContain("Не совсем поняла");
    expect(replies[2]).toContain("1 — Годовщина");
    expect(state.raw.occasion).toBe("сложно сказать что-то");
    expect(replies[3]).toContain("К какой дате");
    const summary = botSummary(state, fields);
    expect(summary).toContain("Повод: не распознано: «сложно сказать что-то»");
  });

  it("«не знаю» — для формата это вариант «Пока не знает», для даты — пропуск без переспроса", () => {
    const { fields: f, state } = talk([["Здравствуйте"], ["маме"], ["др"], ["пока не знаю"], ["не знаю"]]);
    expect(f.format).toBe("Пока не знает");
    expect(state.skipped).toEqual(["event_date"]);
    expect(state.outcome).toBe("finished");
  });

  it("голосовое и фото не пишутся в поля: одно подтверждение, вопрос повторяется", () => {
    const { replies, fields: f, state } = talk([["Здравствуйте"], [msg("🎤 Голосовое сообщение", "audio")], [msg("🎤 Голосовое сообщение", "audio")], [msg("📷 Фото", "image")]]);
    expect(f).toEqual({});
    expect(replies[1]).toContain("Голосовые я пока не слушаю");
    expect(replies[1]).toContain("Для кого будет книга?");
    expect(replies[2]).toBeNull(); // второе голосовое — без повторов
    expect(replies[3]).toContain("Спасибо, получила");
    expect(state.asking).toBe("recipient");
  });

  it("подпись к фото разбирается как текст", () => {
    const { fields: f } = talk([["Здравствуйте"], [msg("для жены", "image")]]);
    expect(f.recipient).toBe("Жене");
  });

  it("«позвоните мне» — бот передаёт менеджеру и замолкает; ночью говорит, когда ответят", () => {
    const later = env({ workTime: false, now: night, nextWorkStart: new Date("2026-10-17T04:00:00Z") });
    const { replies, state } = talk([["Здравствуйте"], ["можете позвонить?"]], later);
    expect(replies[1]).toBe("Передала ваш вопрос менеджеру — он свяжется с вами сегодня с 09:00.");
    expect(state).toMatchObject({ phase: "done", outcome: "handoff", reason: "call" });
  });

  it("вне рабочего времени финал обещает ответ по графику, а не «скоро»", () => {
    const later = env({ workTime: false, now: night, nextWorkStart: new Date("2026-10-17T04:00:00Z") });
    const { replies } = talk([["Здравствуйте, книгу мужу на годовщину 24.11, печатную"]], later);
    expect(replies[0]).toContain("он напишет сегодня с 09:00 🙌");
    expect(replies[0]).not.toContain("скоро");
  });

  it("частый вопрос второй раз — «уточню у менеджера», третий — молча", () => {
    const { replies } = talk([["Здравствуйте, сколько стоит?"], ["а цена какая?"], ["цена?"]]);
    expect(replies[1]).toContain("Этот вопрос уточню у менеджера");
    expect(replies[2]).toBeNull();
  });

  it("«ок» и стикер посреди опроса — бот молчит, вопрос уже в чате", () => {
    const { replies } = talk([["Здравствуйте"], ["ок"], [msg("📷 Фото", "image")]]);
    expect(replies[1]).toBeNull();
  });

  it("клиент просит по-казахски — бот переключается и отвечает о языке книги", () => {
    const { replies, state } = talk([["Здравствуйте"], ["а можно на казахском?"]]);
    expect(state.lang).toBe("kk");
    expect(replies[1]).toContain("Кітапты қазақша немесе орысша жасауға болады");
    expect(replies[1]).toContain("Кітап кімге арналады?");
  });

  it("поля, заполненные в сделке до бота, не спрашиваются и не перезаписываются", () => {
    const { replies, fields: f } = talk([["Здравствуйте, книга маме"]], env({ dealValues: { occasion: "Свадьба", event_date: "2026-12-01" } }));
    expect(f).toEqual({ recipient: "Маме" });
    expect(replies[0]).toContain("Какая книга нужна");
  });

  it("повторная доставка тех же сообщений не даёт второго ответа", () => {
    let state = newBotState(day, true);
    const first = [msg("Здравствуйте")];
    state = botTurn(state, first, env()).state;
    const again = botTurn(state, first, env());
    expect(again.reply).toBeNull();
    expect(again.state).toBe(state);
  });

  it("AI-подсказка дополняет непонятый ответ, но не меняет тексты бота", () => {
    const base = talk([["Здравствуйте"], ["маме"]]);
    const tricky = [msg("Здравствуйте"), msg("маме"), msg("у неё будет праздник, сами понимаете")];
    const plain = botTurn(base.state, tricky, env());
    expect(plain.unclear).toBe(true);
    const hinted = botTurn(base.state, tricky, env({ hints: { fields: { occasion: "День рождения" } } }));
    expect(hinted.fields).toEqual({ occasion: "День рождения" });
    expect(hinted.reply).toContain("К какой дате");
  });

  it("сводка менеджеру: понятная дата, тема, вопросы клиента, ссылки, первое сообщение", () => {
    const { state } = talk([["Здравствуйте! Хочу узнать стоимость."], ["маме"], ["день рождения"], ["21 ноября"], ["печатная"]]);
    const s = botSummary(state, fields);
    expect(s).toContain("Для кого: Маме (тема «Маме»)");
    expect(s).toContain("Дата события: 21 ноября 2026, сб");
    expect(s).toContain("Спрашивал(а): цену");
    expect(s).toContain("Отправлено: https://mybook.kz/kniga/kniga-mame");
    expect(s).toContain("Первое сообщение: «Здравствуйте! Хочу узнать стоимость.»");
  });
});

describe("бот: когда не начинать", () => {
  const deal = { orderId: null, firstStage: true, closed: false, assigned: false, unsorted: true };
  const gate = (p: Partial<Parameters<typeof startBlocker>[0]> = {}) => startBlocker({ channelOk: true, questions: 4, deal, fresh: true, client: null, priorChat: false, inputs: [msg("Здравствуйте")], ...p });
  it("заказ, книга, сделка в работе, переписка до CRM, одно слово-ответ, только фото", () => {
    expect(gate()).toBeNull();
    expect(gate({ channelOk: false })).toBe("channel");
    expect(gate({ deal: { ...deal, orderId: "o1" } })).toBe("client_has_order");
    expect(gate({ client: { orders: 0, books: 1 } })).toBe("client_has_book");
    expect(gate({ fresh: false, deal: { ...deal, firstStage: false } })).toBe("deal_in_work");
    expect(gate({ fresh: false, deal: { ...deal, assigned: true, unsorted: false } })).toBe("deal_in_work");
    expect(gate({ priorChat: true })).toBe("prior_chat");
    expect(gate({ inputs: [msg("Маме")] })).toBe("continuation");
    expect(gate({ inputs: [msg("я оплатила")] })).toBe("continuation");
    expect(gate({ inputs: [msg("📷 Фото", "image")] })).toBe("media_only");
    expect(gate({ inputs: [msg("🎤 Голосовое сообщение", "audio")] })).toBeNull();
  });
});

describe("настройки бота: старый формат с прода читается", () => {
  it("старый JSON — русские тексты владельца, казахские заводские, вопросы с казахским текстом", () => {
    const old = JSON.stringify({ greeting: "Привет, {имя}!", finish: "Пока!", questions: [{ text: "Кому дарите?", field: "recipient" }, { text: "Свой вопрос?", field: "custom" }] });
    const c: BotConfig = parseBotConfig(old);
    expect(c.texts.ru.greeting).toBe("Привет, {имя}!");
    expect(c.texts.ru.finish).toBe("Пока!");
    expect(c.texts.kk.greeting).toBe(defaultBotConfig.texts.kk.greeting);
    expect(c.questions).toEqual([
      { field: "recipient", text: { ru: "Кому дарите?", kk: "Кітап кімге арналады? Мысалы: анаңызға, күйеуіңізге, құрбыңызға." } },
      { field: "custom", text: { ru: "Свой вопрос?", kk: "" } },
    ]);
    expect(c.channels).toEqual(["whatsapp"]);
    expect(c.faq.price.on).toBe(true);
  });

  it("новый формат сохраняется и читается без потерь; мусор — заводские значения", () => {
    const c = { ...defaultBotConfig, channels: ["whatsapp", "site"] as BotConfig["channels"], waitMinutes: 5, promo: { ru: "Сегодня скидка", kk: "Бүгін жеңілдік" } };
    expect(parseBotConfig(JSON.stringify(c))).toEqual(c);
    expect(parseBotConfig("{bad")).toEqual(defaultBotConfig);
    expect(parseBotConfig(JSON.stringify({ waitMinutes: 999, channels: ["email", "site"] }))).toMatchObject({ waitMinutes: 3, channels: ["site"] });
  });
});
