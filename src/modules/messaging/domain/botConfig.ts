/**
 * Бот-квалификатор: настройки (bot.config) — каналы, вопросы → свои поля сделки, тексты и ответы на частые вопросы
 * на русском и казахском. Читается и старый формат { greeting, questions: [{ text, field }], finish } — он становится
 * русскими текстами, казахские берутся заводские. Без обращения к БД (покрыто тестами).
 */
import { FAQ_INTENTS, type BotLang, type FaqIntent } from "./botNlu";

export { matchOption, parseDateAnswer, mentionsMonth, monthOf } from "./botParse";
export type { BotLang, FaqIntent } from "./botNlu";

export const BOT_LANGS: readonly BotLang[] = ["ru", "kk"];
export type Localized = Record<BotLang, string>;

/** Каналы, где бот может работать. Почта — никогда: письма ведёт человек. */
export type BotChannel = "whatsapp" | "site" | "instagram" | "telegram";
export const BOT_CHANNELS: readonly BotChannel[] = ["whatsapp", "site", "instagram", "telegram"];

/** Канал диалога → канал бота (null — бот там не работает). */
export function botChannelOf(channel: string): BotChannel | null {
  if (channel === "whatsapp" || channel === "wapi") return "whatsapp";
  if (channel === "telegram" || channel === "tgapi") return "telegram";
  if (channel === "site" || channel === "instagram") return channel;
  return null;
}

export interface BotQuestion {
  /** Ключ своего поля сделки, куда записать ответ. */
  field: string;
  text: Localized;
}

/** Тексты бота на одном языке. {имя}, {когда} (когда ответит менеджер), {что} (что бот понял), {ссылка}. */
export interface BotTexts {
  greeting: string;
  /** Конец опроса в рабочее время. */
  finish: string;
  /** Конец опроса вне рабочего времени: «…напишет {когда}». */
  finishLater: string;
  /** Клиент просит человека (позвонить, менеджера, оплатить). */
  handoff: string;
  handoffLater: string;
  voice: string;
  media: string;
  /** Переспрос, если ответ не понят. */
  reask: string;
  /** Бот понял сразу несколько ответов: «Поняла: {что}». */
  noted: string;
  /** Тот же частый вопрос второй раз. */
  repeat: string;
  /** «Не интересует». */
  decline: string;
  /** Ссылка на пример книги и на начало книги. */
  linkExample: string;
  linkStart: string;
}
export type BotTextKey = keyof BotTexts;

export interface BotFaqAnswer {
  on: boolean;
  text: Localized;
}

export interface BotConfig {
  channels: BotChannel[];
  /** Режим «если менеджер не ответил»: сколько минут ждать в рабочее время. */
  waitMinutes: number;
  questions: BotQuestion[];
  texts: Record<BotLang, BotTexts>;
  faq: Record<FaqIntent, BotFaqAnswer>;
  /** Строка акции, которую владелец пишет сам ({акция} в ответе о цене). Пусто — акций бот не упоминает. */
  promo: Localized;
  /** Подписи вариантов полей-списков по-казахски: вариант CRM → подпись. Пусто — заводской перевод или как в CRM. */
  optionLabels: Record<string, string>;
  /** После ответа «для кого» прислать ссылку на пример книги (или начать книгу, если регистрация открыта). */
  sendLink: boolean;
  /** AI дополняет разбор ответов (если AI-помощник настроен); тексты клиенту — только из настроек. */
  ai: boolean;
}

export const MAX_QUESTIONS = 6;

export const defaultTexts: Record<BotLang, BotTexts> = {
  ru: {
    greeting: "Здравствуйте, {имя}! Я помощник MyBooks — задам пару коротких вопросов, чтобы менеджер сразу подготовил для вас предложение.",
    finish: "Спасибо! Передала ваши ответы менеджеру — он скоро напишет 🙌",
    finishLater: "Спасибо! Передала ваши ответы менеджеру — он напишет {когда} 🙌",
    handoff: "Передала ваш вопрос менеджеру — он свяжется с вами в ближайшее время.",
    handoffLater: "Передала ваш вопрос менеджеру — он свяжется с вами {когда}.",
    voice: "Голосовые я пока не слушаю — менеджер прослушает сам. Если удобно, ответьте текстом или цифрой 🙏",
    media: "Спасибо, получила — передам менеджеру.",
    reask: "Не совсем поняла 🙏 Ответьте, пожалуйста, цифрой или своими словами.",
    noted: "Поняла: {что}.",
    repeat: "Этот вопрос уточню у менеджера — он ответит подробнее.",
    decline: "Поняла, спасибо! Если появятся вопросы — пишите, будем рады помочь.",
    linkExample: "Посмотрите, как выглядит такая книга: {ссылка}",
    linkStart: "Начать книгу можно здесь: {ссылка}",
  },
  kk: {
    greeting: "Сәлеметсіз бе, {имя}! Мен MyBooks көмекшісімін — менеджер сізге бірден ұсыныс дайындауы үшін бірнеше қысқа сұрақ қоямын.",
    finish: "Рақмет! Жауаптарыңызды менеджерге жеткіздім — ол жақын арада жазады 🙌",
    finishLater: "Рақмет! Жауаптарыңызды менеджерге жеткіздім — ол {когда} жазады 🙌",
    handoff: "Сұрағыңызды менеджерге жеткіздім — ол жақын арада хабарласады.",
    handoffLater: "Сұрағыңызды менеджерге жеткіздім — ол {когда} хабарласады.",
    voice: "Дауыстық хабарламаларды әзірге тыңдай алмаймын — менеджер өзі тыңдайды. Ыңғайлы болса, мәтінмен не цифрмен жауап беріңіз 🙏",
    media: "Рақмет, алдым — менеджерге жеткіземін.",
    reask: "Түсінбей қалдым 🙏 Цифрмен не өз сөзіңізбен жауап беріңізші.",
    noted: "Түсіндім: {что}.",
    repeat: "Бұл сұрақты менеджерден нақтылаймын — ол толығырақ жауап береді.",
    decline: "Түсіндім, рақмет! Сұрақтарыңыз болса, жазыңыз — көмектесуге қуаныштымыз.",
    linkExample: "Мұндай кітаптың үлгісін мына жерден көріңіз: {ссылка}",
    linkStart: "Кітапты мына жерден бастай аласыз: {ссылка}",
  },
};

/** Заводские вопросы (поля сделки CRM по умолчанию). Казахский текст подставляется и к вопросам из старых настроек. */
export const defaultQuestions: BotQuestion[] = [
  { field: "recipient", text: { ru: "Для кого будет книга? Например: для мамы, для мужа, для подруги.", kk: "Кітап кімге арналады? Мысалы: анаңызға, күйеуіңізге, құрбыңызға." } },
  { field: "occasion", text: { ru: "По какому поводу дарите?", kk: "Қандай мерекеге сыйлайсыз?" } },
  { field: "event_date", text: { ru: "К какой дате нужна книга? Например: 15.11", kk: "Кітап қай күнге керек? Мысалы: 15.11" } },
  { field: "format", text: { ru: "Какая книга нужна — печатная или электронная?", kk: "Қандай кітап керек — қатты мұқабалы ма, әлде электрондық па?" } },
];

/**
 * Ответы на частые вопросы. Цифры — только переменными из «Цен и тарифов» и сроков сайта ({цена.печатная}, {доставка.курьер},
 * {срок.производства}…). Цену по умолчанию бот не называет: какие цены и акции он говорит, решает владелец (docs/features/bot-autoresponder.md).
 */
export const defaultFaq: Record<FaqIntent, BotFaqAnswer> = {
  price: {
    on: true,
    text: {
      ru: "Стоимость зависит от формата книги и действующей акции — точную цену менеджер назовёт в ответе.",
      kk: "Бағасы кітаптың түріне және қазіргі акцияға байланысты — нақты бағасын менеджер жауабында айтады.",
    },
  },
  how: {
    on: true,
    text: {
      ru: "Всё просто: вы отвечаете на вопросы о близком человеке на сайте — с телефона или компьютера, в своём темпе. К каждому вопросу есть подсказки, вёрстку и оформление мы берём на себя, а потом печатаем настоящую книгу.",
      kk: "Бәрі оңай: сайтта жақын адамыңыз туралы сұрақтарға телефоннан не компьютерден, өз қарқыныңызбен жауап бересіз. Әр сұрақтың кеңесі бар, беттеу мен безендіруді біз өз мойнымызға аламыз, содан кейін нағыз кітап етіп басып шығарамыз.",
    },
  },
  timing: {
    on: true,
    text: {
      ru: "Печать занимает {срок.производства} рабочих дней (с экспресс-печатью — {срок.экспресс}), плюс доставка. Электронную версию можно скачать сразу после оплаты. Сколько писать — решаете вы: обычно от двух вечеров до пары недель.",
      kk: "Басып шығару {срок.производства} жұмыс күнін алады (экспресс-баспамен — {срок.экспресс}), оған жеткізу қосылады. Электрондық нұсқасын төлемнен кейін бірден жүктеп алуға болады. Жазу уақытын өзіңіз шешесіз: әдетте екі кештен екі аптаға дейін.",
    },
  },
  delivery: {
    on: true,
    text: {
      ru: "Доставляем курьером по Алматы и Астане — {доставка.курьер}, по всему Казахстану — {доставка.почта}, самовывоз в Алматы — {доставка.самовывоз}.",
      kk: "Алматы мен Астанада курьермен жеткіземіз — {доставка.курьер}, бүкіл Қазақстан бойынша — {доставка.почта}, Алматыда өзіңіз алып кетсеңіз — {доставка.самовывоз}.",
    },
  },
  payment: {
    on: true,
    text: {
      ru: "Оплата — по счёту, который пришлёт менеджер: через Kaspi или банковской картой. Про предоплату и рассрочку менеджер расскажет в ответе.",
      kk: "Төлем менеджер жіберетін шот арқылы жүреді: Kaspi немесе банк картасы. Алдын ала төлем мен бөліп төлеу туралы менеджер жауабында айтады.",
    },
  },
  examples: {
    on: true,
    text: {
      ru: "Примеры вопросов и как выглядит книга — на сайте: {ссылка}",
      kk: "Сұрақтардың мысалдары мен кітаптың көрінісі — сайтта: {ссылка}",
    },
  },
  language: {
    on: true,
    text: {
      ru: "Книгу можно сделать на русском или казахском — язык выбирается при создании, вопросы и заголовки будут на нём. Отвечать можно на любом языке.",
      kk: "Кітапты қазақша немесе орысша жасауға болады — тіл кітапты құрған кезде таңдалады, сұрақтар мен тақырыптар сол тілде болады. Жауапты кез келген тілде жаза аласыз.",
    },
  },
};

/** Заводские казахские подписи вариантов полей CRM по умолчанию. */
export const defaultOptionLabels: Record<string, string> = {
  Годовщина: "Жылдық мереке",
  "День рождения": "Туған күн",
  "14 февраля": "14 ақпан",
  "8 марта": "8 наурыз",
  "Новый год": "Жаңа жыл",
  Свадьба: "Үйлену тойы",
  "Юбилей родителей": "Ата-ананың мерейтойы",
  Выпускной: "Бітіру кеші",
  "Другой повод": "Басқа себеп",
  Печатная: "Қатты мұқабалы",
  Электронная: "Электрондық",
  "Пока не знает": "Әзірге білмеймін",
};

export const defaultBotConfig: BotConfig = {
  channels: ["whatsapp"],
  waitMinutes: 3,
  questions: defaultQuestions,
  texts: defaultTexts,
  faq: defaultFaq,
  promo: { ru: "", kk: "" },
  optionLabels: {},
  sendLink: true,
  ai: false,
};

const LIMIT = { text: 500, question: 400, faq: 1000, promo: 300 };
const record = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);
const localized = (v: unknown, max: number, fallback: Localized): Localized => {
  const r = record(v);
  return { ru: str(r.ru, max) ?? fallback.ru, kk: str(r.kk, max) ?? fallback.kk };
};
const factoryQuestion = (field: string) => defaultQuestions.find((q) => q.field === field);

function parseQuestions(raw: unknown, legacy: boolean): BotQuestion[] {
  if (!Array.isArray(raw)) return defaultQuestions;
  const out: BotQuestion[] = [];
  for (const item of raw) {
    const q = record(item);
    if (typeof q.field !== "string" || !q.field) continue;
    const factory = factoryQuestion(q.field);
    // Старый формат: один текст — русский; казахский — заводской для этого поля (или пусто → русский).
    const text = legacy || typeof q.text === "string" ? { ru: str(q.text, LIMIT.question) ?? "", kk: factory?.text.kk ?? "" } : localized(q.text, LIMIT.question, { ru: "", kk: "" });
    if (!text.ru.trim() && !text.kk.trim()) continue;
    out.push({ field: q.field.slice(0, 40), text });
  }
  return out.slice(0, MAX_QUESTIONS);
}

/** Настройка бота из crm_settings: новый формат, старый (до двух языков) или мусор → заводские значения. */
export function parseBotConfig(raw: string | null | undefined): BotConfig {
  let v: Record<string, unknown>;
  try {
    v = record(JSON.parse(raw ?? ""));
  } catch {
    return defaultBotConfig;
  }
  const legacy = !("texts" in v);
  const texts = Object.fromEntries(
    BOT_LANGS.map((lang) => {
      const r = record(record(v.texts)[lang]);
      const t = Object.fromEntries((Object.keys(defaultTexts.ru) as BotTextKey[]).map((k) => [k, str(r[k], LIMIT.text) ?? defaultTexts[lang][k]])) as unknown as BotTexts;
      return [lang, t];
    }),
  ) as Record<BotLang, BotTexts>;
  if (legacy) {
    // Старый формат: приветствие и финал — русские тексты (их правил владелец), остальное — заводское.
    if (typeof v.greeting === "string") texts.ru.greeting = v.greeting.slice(0, LIMIT.text);
    if (typeof v.finish === "string") texts.ru.finish = v.finish.slice(0, LIMIT.text);
  }
  const faqRaw = record(v.faq);
  const faq = Object.fromEntries(
    FAQ_INTENTS.map((i) => {
      const r = record(faqRaw[i]);
      return [i, { on: typeof r.on === "boolean" ? r.on : defaultFaq[i].on, text: localized(r.text, LIMIT.faq, defaultFaq[i].text) }];
    }),
  ) as Record<FaqIntent, BotFaqAnswer>;
  const channels = Array.isArray(v.channels) ? BOT_CHANNELS.filter((c) => (v.channels as unknown[]).includes(c)) : defaultBotConfig.channels;
  const wait = Number(v.waitMinutes);
  const labels = Object.fromEntries(
    Object.entries(record(v.optionLabels))
      .filter(([k, l]) => typeof l === "string" && l.trim() && k.length <= 100)
      .map(([k, l]) => [k, (l as string).slice(0, 100)]),
  );
  return {
    channels,
    waitMinutes: Number.isInteger(wait) && wait >= 1 && wait <= 120 ? wait : defaultBotConfig.waitMinutes,
    questions: parseQuestions(v.questions, legacy),
    texts,
    faq,
    promo: localized(v.promo, LIMIT.promo, defaultBotConfig.promo),
    optionLabels: labels,
    sendLink: typeof v.sendLink === "boolean" ? v.sendLink : defaultBotConfig.sendLink,
    ai: v.ai === true,
  };
}

/** Текст бота на языке клиента; пустой казахский — заводской казахский, а не русский. */
export function botText(config: BotConfig, lang: BotLang, key: BotTextKey) {
  return config.texts[lang][key].trim() || defaultTexts[lang][key];
}

/** Вопрос на языке клиента: пустой казахский → заводской казахский этого поля → русский. */
export function questionFor(q: BotQuestion, lang: BotLang) {
  if (lang === "kk") return q.text.kk.trim() || factoryQuestion(q.field)?.text.kk || q.text.ru;
  return q.text.ru.trim() || q.text.kk;
}

/** Ответ на частый вопрос на языке клиента. */
export function faqFor(config: BotConfig, intent: FaqIntent, lang: BotLang) {
  const a = config.faq[intent];
  return a.text[lang].trim() || defaultFaq[intent].text[lang];
}

/** Подпись варианта списка для клиента: по-казахски — из настроек, заводская или как в CRM. */
export function optionLabel(config: BotConfig, option: string, lang: BotLang) {
  if (lang !== "kk") return option;
  return config.optionLabels[option]?.trim() || defaultOptionLabels[option] || option;
}

/** Вопрос с вариантами по номерам, чтобы клиенту было проще ответить цифрой. */
export function questionText(text: string, options: string[] | null) {
  if (!options?.length) return text;
  return `${text}\n${options.map((o, i) => `${i + 1} — ${o}`).join("\n")}`;
}
