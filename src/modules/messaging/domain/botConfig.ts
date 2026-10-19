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
  /** Режим «Продаёт»: ценность книги — после опроса вместо «передала менеджеру». */
  offer: string;
  /** Цена «от» и предоплата ({цена.печатная}, {акция}, {предоплата}); строка с пустой переменной не выводится. */
  offerPrice: string;
  /** Успеем к дате: {дата} — когда нужна книга, {заполнить_до} — до какого дня дописать. */
  deadlineOk: string;
  /** Успеем только с экспресс-печатью. */
  deadlineExpress: string;
  /** К дате печатную уже не успеть. */
  deadlineLate: string;
  /** Призыв оформить. */
  close: string;
  /** Короткое напоминание после ответа на вопрос: «Оформляем?» */
  closeShort: string;
  /** Клиент согласен — менеджер выставит счёт. */
  /** Клиент согласен, счёт выставить не вышло — его пришлёт менеджер. */
  agreed: string;
  agreedLater: string;
  /** Бот выставил счёт сам: текст перед сообщением со счётом. */
  invoiceSent: string;
  /** «Дорого», «денег нет». */
  objPrice: string;
  /** «Подумаю», «завтра», «после зарплаты». */
  objLater: string;
  /** Одно напоминание, если клиент замолчал после предложения. */
  followUp: string;
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
  /** Режим «Продаёт»: после опроса бот делает предложение и доводит до «да, оформляем». */
  sell: BotSell;
}

/**
 * Режим «Продаёт» — по скрипту менеджеров, которые продают: ценность → цена «от» и предоплата → «успеем к дате» →
 * «Оформляем?», ответы на «дорого» и «подумаю», одно напоминание. Счёт бот не выставляет: точную цену со скидкой
 * называет менеджер (решение владельца 17.10) — на «да» бот ставит ему срочную задачу «Выставить счёт».
 */
export interface BotSell {
  on: boolean;
  /** Предоплата, чтобы начать ({предоплата}), ₸; 0 — строки с ней не выводятся. */
  prepay: number;
  /** Сколько дней клиенты обычно пишут книгу — для «успеем к дате». */
  writeDays: number;
  /** Доставка, дней (по Казахстану, с запасом). */
  deliveryDays: number;
  /** Напомнить через столько часов тишины после предложения (в рабочее время); 0 — не напоминать. */
  followUpHours: number;
  /**
   * На «да» бот сам выставляет счёт (ссылка /pay и счёт Kaspi на номер WhatsApp) по цене тарифа из «Цен и тарифов» —
   * своей цены у бота нет (deals-d13: после подъёма прайса счёт не уходит по старой цене). Не вышло — счёт выставит менеджер.
   */
  invoice: boolean;
  /**
   * Кто ведёт продающую беседу: "ai" — модель (понимает свободную речь, сама отвечает; цены, сроки и счёт — под
   * контролем кода), "template" — тексты из настроек. Без подключённого AI продажник работает по шаблонам.
   */
  engine: "ai" | "template";
  /** Подхватывать уже начатую переписку, если менеджер не ответил (ждёт waitMinutes в рабочее время, ночью — сразу). */
  takeover: boolean;
  /** Указания владельца продажнику: тон, акценты, чего избегать (до 1500 знаков). */
  persona: string;
  /** Потолок ответов модели в одной беседе; дальше — менеджер. */
  maxTurns: number;
  /** AI-продажник не называет цены и предоплату вообще — их озвучивает только менеджер (несколько вариантов книг). */
  hidePrices: boolean;
  /** Распознавать голосовые и фото клиента моделью (транскрипция и описание); без поддержки моделью — как раньше. */
  media: boolean;
  /**
   * От чьего имени пишет бот: manager — сам менеджер («Меня зовут Марат», от первого лица; решение владельца 18.10),
   * assistant — его помощница («Айгерим, помощница менеджера Марата»).
   */
  speaksAs: BotSpeaksAs;
  /** Как представляется помощница (speaksAs = assistant): «Айгерим, помощница менеджера Марата». */
  botName: string;
  /** Менеджер, который называет цену и оформляет заказ; при speaksAs = manager бот пишет от его имени. */
  managerName: string;
  /** Факты владельца для беседы: сроки, доставка, как пишется книга, способы оплаты (без цен). Правится в настройках. */
  facts: string;
  /** Сколько календарных дней книга готовится после того, как клиент её дописал (для «успеем к дате»). */
  productionDays: number;
  /** Работа над ошибками: раз в сутки модель разбирает беседы бота и обновляет уроки в его инструкции. */
  selfImprove: boolean;
  /**
   * AI-продажник пишет повторно в названное клиентом время («после зарплаты», «в пятницу», «ближе к празднику»): дату
   * предлагает модель, код проверяет (рабочее время, не дальше remindMaxDays, не позже даты события, не «не писать первым»).
   */
  remind: boolean;
  /** Тёплому неоплатившему с датой события — одно сообщение в последний день, когда ещё можно начать и успеть. */
  lastStart: boolean;
  /** Повторное сообщение — не дальше стольких дней от сегодня. */
  remindMaxDays: number;
  /** Повторных сообщений (по договорённости и в последний день) — не больше стольких за беседу. */
  remindTouches: number;
}

/** Факты владельца по умолчанию (решение 18.10 и переписки менеджера): сроки, доставка, как пишется книга, оплата. */
export const DEFAULT_SELL_FACTS = [
  "Книга готовится до 5 дней (обычно 4–5) после того, как клиент дописал её на сайте.",
  "Доставка по Алматы — в день готовности. По Казахстану — 2–5 дней, зависит от города (СДЭК, Казпочта, InDriver). Доставка оплачивается отдельно, в Алматы есть самовывоз.",
  "Книгу клиент пишет сам на нашем сайте: около 170 готовых вопросов с подсказками, отвечать на все не обязательно; обычно пишут 2–3 дня. Писать можно на русском или казахском.",
  "В среднем выходит 80 страниц (от 60 до 200). Фото клиент добавляет сам, дизайн и обложку выбирает сам — можно своё фото на обложку. Клиент — полноценный автор книги.",
  "Печатная книга — в твёрдом переплёте и подарочной коробке. Есть электронная версия (PDF).",
  "Оплата: предоплата, остальное — когда электронная версия готова и клиент её одобрил, перед печатью. Можно через Kaspi Red или в рассрочку 0-0-12 без переплаты.",
  "Работаем онлайн по всему Казахстану, типография в Алматы.",
].join("\n");

export const MAX_QUESTIONS = 6;

export type BotSpeaksAs = "manager" | "assistant";

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
    linkExample: "Посмотрите, как выглядит такая книга: {ссылка}\nЛичный кабинет, где пишется книга, откроет менеджер — или он откроется сам после оплаты счёта.",
    linkStart: "Начать книгу можно здесь: {ссылка}",
    offer: "Такая книга — один из самых трогательных подарков: вы отвечаете на готовые вопросы с подсказками и добавляете фото, а вёрстку, оформление и печать мы берём на себя. Обычно выходит 60–200 страниц в твёрдом переплёте. Автор книги — вы 🤍",
    offerPrice: "Печатная книга — от {цена.печатная}, электронная — от {цена.электронная}.\n{акция}\nЧтобы начать, достаточно предоплаты {предоплата}, остальное — когда книга будет готова к печати.",
    deadlineOk: "К {дата} успеваем 👍 Допишите книгу до {заполнить_до} — и она будет у вас вовремя.",
    deadlineExpress: "К {дата} впритык, но успеем с экспресс-печатью, если допишете книгу до {заполнить_до}.",
    deadlineLate: "К {дата} напечатать и доставить уже не успеем 😔 Электронную версию можно скачать, как только книга будет готова, а печатную привезём чуть позже.",
    close: "Оформляем? Напишите «да» — пришлю счёт на предоплату, а после оплаты сразу откроется кабинет, где пишется книга.",
    closeShort: "Оформляем книгу? 🙂",
    agreed: "Отлично! 🙌 Передала менеджеру — он пришлёт счёт на предоплату в ближайшие минуты, а после оплаты откроем кабинет.",
    agreedLater: "Отлично! 🙌 Передала менеджеру — он пришлёт счёт на предоплату {когда}, а после оплаты откроем кабинет.",
    invoiceSent: "Отлично! 🙌 Отправляю счёт — после оплаты кабинет, где пишется книга, откроется сам.",
    objPrice: "Понимаю 🙏\nМожно частями: сначала предоплата {предоплата}, остальное — перед печатью, когда книга уже готова.\nЕсть и электронная версия — от {цена.электронная}.",
    objLater: "Конечно, подумайте 🙏\n{акция}\nЕсли удобно, можно сразу внести предоплату {предоплата} — а книгу писать в своём темпе, без спешки.",
    followUp: "Здравствуйте, {имя}! Успели посмотреть? 🙂 Если остались вопросы — спрашивайте.\nЧтобы книга успела к {дата}, лучше начать сегодня-завтра.",
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
    linkExample: "Мұндай кітаптың үлгісін мына жерден көріңіз: {ссылка}\nКітап жазатын жеке кабинетті менеджер ашып береді немесе шотты төлегеннен кейін ол өздігінен ашылады.",
    linkStart: "Кітапты мына жерден бастай аласыз: {ссылка}",
    offer: "Мұндай кітап — ең әсерлі сыйлықтардың бірі: сіз кеңесі бар дайын сұрақтарға жауап беріп, фото қосасыз, ал беттеу, безендіру мен басып шығаруды біз өз мойнымызға аламыз. Әдетте қатты мұқабалы 60–200 бет шығады. Кітаптың авторы — сіз 🤍",
    offerPrice: "Қатты мұқабалы кітаптың бастапқы бағасы — {цена.печатная}, электрондық — {цена.электронная}.\n{акция}\nБастау үшін {предоплата} алдын ала төлем жеткілікті, қалғаны — кітап басуға дайын болғанда.",
    deadlineOk: "{дата} күніне үлгереміз 👍 Кітапты толтырудың соңғы күні — {заполнить_до}, сонда ол уақытында қолыңызда болады.",
    deadlineExpress: "{дата} күніне уақыт тығыз, бірақ экспресс-баспамен үлгереміз. Кітапты толтырудың соңғы күні — {заполнить_до}.",
    deadlineLate: "{дата} күніне басып, жеткізіп үлгермейміз 😔 Электрондық нұсқасын кітап дайын болған бойда жүктеп алуға болады, ал басылған кітапты сәл кейінірек жеткіземіз.",
    close: "Рәсімдейміз бе? «Иә» деп жазыңыз — алдын ала төлем шотын жіберемін, төлегеннен кейін кітап жазатын кабинет бірден ашылады.",
    closeShort: "Кітапты рәсімдейміз бе? 🙂",
    agreed: "Тамаша! 🙌 Менеджерге жеткіздім — ол алдын ала төлем шотын жақын арада жібереді, төлемнен кейін кабинетті ашамыз.",
    agreedLater: "Тамаша! 🙌 Менеджерге жеткіздім — ол алдын ала төлем шотын {когда} жібереді, төлемнен кейін кабинетті ашамыз.",
    invoiceSent: "Тамаша! 🙌 Шотты жіберіп жатырмын — төлегеннен кейін кітап жазатын кабинет өздігінен ашылады.",
    objPrice: "Түсінемін 🙏\nБөліп төлеуге болады: алдымен {предоплата} алдын ала төлем, қалғаны — кітап дайын болып, басып шығарар алдында.\nЭлектрондық нұсқасы да бар, бастапқы бағасы — {цена.электронная}.",
    objLater: "Әрине, ойланыңыз 🙏\n{акция}\nЫңғайлы болса, {предоплата} алдын ала төлемді бірден жасап қоюға болады — ал кітапты асықпай, өз қарқыныңызбен жаза бересіз.",
    followUp: "Сәлеметсіз бе, {имя}! Қарап шықтыңыз ба? 🙂 Сұрақтарыңыз болса, жазыңыз.\nКітап {дата} күніне үлгеруі үшін бүгін-ертең бастаған дұрыс.",
  },
};

/**
 * Те же тексты голосом самого менеджера (speaksAs = manager): от первого лица, без «передала менеджеру» и без рода
 * («уточню», «посмотрю»): имя менеджера в настройках, а род по имени не угадываем. Остальные тексты — общие.
 */
export const managerVoiceTexts: Record<BotLang, Partial<BotTexts>> = {
  ru: {
    greeting: "Здравствуйте, {имя}! Задам пару коротких вопросов, чтобы сразу подготовить для вас предложение.",
    finish: "Спасибо! Посмотрю ваши ответы и скоро напишу 🙌",
    finishLater: "Спасибо! Посмотрю ваши ответы и напишу {когда} 🙌",
    handoff: "Уточню и вернусь к вам в ближайшее время.",
    handoffLater: "Уточню и вернусь к вам {когда}.",
    voice: "Голосовое послушаю чуть позже. Если удобно, ответьте текстом или цифрой 🙏",
    media: "Спасибо, всё вижу — посмотрю и напишу.",
    reask: "Не совсем понятно 🙏 Ответьте, пожалуйста, цифрой или своими словами.",
    noted: "Записываю: {что}.",
    repeat: "Этот вопрос уточню и отвечу подробнее.",
    decline: "Хорошо, спасибо! Если появятся вопросы — пишите, я на связи.",
    linkExample: "Посмотрите, как выглядит такая книга: {ссылка}\nЛичный кабинет, где пишется книга, открою вам — или он откроется сам после оплаты счёта.",
    agreed: "Отлично! 🙌 Пришлю счёт на предоплату в ближайшие минуты, а после оплаты откроем кабинет.",
    agreedLater: "Отлично! 🙌 Пришлю счёт на предоплату {когда}, а после оплаты откроем кабинет.",
  },
  kk: {
    greeting: "Сәлеметсіз бе, {имя}! Сізге бірден ұсыныс дайындау үшін бірнеше қысқа сұрақ қоямын.",
    finish: "Рақмет! Жауаптарыңызды қарап, жақын арада жазамын 🙌",
    finishLater: "Рақмет! Жауаптарыңызды қарап, {когда} жазамын 🙌",
    handoff: "Нақтылап, жақын арада хабарласамын.",
    handoffLater: "Нақтылап, {когда} хабарласамын.",
    voice: "Дауыстық хабарламаны сәл кейінірек тыңдаймын. Ыңғайлы болса, мәтінмен не цифрмен жауап беріңіз 🙏",
    media: "Рақмет, көрдім — қарап шығып, жазамын.",
    repeat: "Бұл сұрақты нақтылап, толығырақ жауап беремін.",
    linkExample: "Мұндай кітаптың үлгісін мына жерден көріңіз: {ссылка}\nКітап жазатын жеке кабинетті өзім ашып беремін немесе шотты төлегеннен кейін ол өздігінен ашылады.",
    agreed: "Тамаша! 🙌 Алдын ала төлем шотын жақын арада жіберемін, төлемнен кейін кабинетті ашамыз.",
    agreedLater: "Тамаша! 🙌 Алдын ала төлем шотын {когда} жіберемін, төлемнен кейін кабинетті ашамыз.",
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
 * {срок.производства}…). Цена — «от» по тарифам плюс строка акции из настроек; точную сумму со скидкой называет менеджер
 * (решение владельца 17.10, docs/features/bot-autoresponder.md). Строка с пустой переменной (тариф скрыт) не выводится.
 */
export const defaultFaq: Record<FaqIntent, BotFaqAnswer> = {
  price: {
    on: true,
    text: {
      ru: "Электронная книга — от {цена.электронная}.\nПечатная в твёрдой обложке — от {цена.печатная}.\n{акция}\nТочную сумму с учётом акции и доставки менеджер назовёт в ответе.",
      kk: "Электрондық кітаптың бастапқы бағасы — {цена.электронная}.\nҚатты мұқабалы кітаптың бастапқы бағасы — {цена.печатная}.\n{акция}\nАкция мен жеткізуді ескергендегі нақты соманы менеджер жауабында айтады.",
    },
  },
  how: {
    on: true,
    text: {
      ru: "Всё просто: вы пишете книгу на сайте — с телефона или компьютера, в своём темпе. В подарок — отвечаете на вопросы о близком человеке; в автобиографии — о своей жизни (или записываете со слов близкого); а можно написать свою книгу с нуля, своими главами. К вопросам есть подсказки, вёрстку и оформление мы берём на себя, а потом печатаем настоящую книгу.",
      kk: "Бәрі оңай: кітапты сайтта телефоннан не компьютерден, өз қарқыныңызбен жазасыз. Сыйлық кітапта — жақын адамыңыз туралы сұрақтарға жауап бересіз; өмірбаянда — өз өміріңіз туралы жазасыз не жақыныңыздың айтқанын жазып аласыз; ал өз кітабыңызды нөлден, өз тарауларыңызбен де жаза аласыз. Сұрақтардың кеңесі бар, беттеу мен безендіруді біз өз мойнымызға аламыз, содан кейін нағыз кітап етіп басып шығарамыз.",
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
      ru: "Доставляем курьером по Алматы и Астане — {доставка.курьер}, по всему Казахстану — {доставка.почта}, самовывоз в Алматы — {доставка.самовывоз}.\nОтправляем и в другие страны — {доставка.заграница}.",
      kk: "Алматы мен Астанада курьермен жеткіземіз — {доставка.курьер}, бүкіл Қазақстан бойынша — {доставка.почта}, Алматыда өзіңіз алып кетсеңіз — {доставка.самовывоз}.\nБасқа елдерге де жібереміз — {доставка.заграница}.",
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

/** Сколько раз за беседу бот пишет клиенту сам по договорённости или в последний день — не больше двух (решение владельца по P0-12). */
export const REMIND_TOUCHES_MAX = 2;

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
  sell: { on: false, prepay: 0, writeDays: 2, deliveryDays: 2, followUpHours: 3, invoice: false, engine: "ai", takeover: true, persona: "", maxTurns: 40, hidePrices: true, media: true, speaksAs: "manager", botName: "Айгерим", managerName: "Марат", facts: DEFAULT_SELL_FACTS, productionDays: 5, selfImprove: true, remind: false, lastStart: false, remindMaxDays: 60, remindTouches: 2 },
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
    sell: parseSell(v.sell),
  };
}

const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};

/** Имя для представления: одно-два слова, без цифр и ссылок; пусто — по умолчанию. */
const name = (v: unknown, fallback: string) => {
  const t = typeof v === "string" ? v.replace(/[^\p{L}\s'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 40) : "";
  return t || fallback;
};

function parseSell(raw: unknown): BotSell {
  const r = record(raw);
  const d = defaultBotConfig.sell;
  return {
    on: r.on === true,
    prepay: int(r.prepay, 0, 1_000_000, d.prepay),
    writeDays: int(r.writeDays, 0, 30, d.writeDays),
    deliveryDays: int(r.deliveryDays, 0, 30, d.deliveryDays),
    followUpHours: int(r.followUpHours, 0, 72, d.followUpHours),
    // Прежняя «цена в счёте бота» (sell.prices) не читается: счёт бота — по «Ценам и тарифам».
    invoice: r.invoice === true,
    engine: r.engine === "template" ? "template" : "ai",
    takeover: typeof r.takeover === "boolean" ? r.takeover : d.takeover,
    persona: typeof r.persona === "string" ? r.persona.slice(0, 1500) : d.persona,
    maxTurns: int(r.maxTurns, 4, 100, d.maxTurns),
    hidePrices: typeof r.hidePrices === "boolean" ? r.hidePrices : d.hidePrices,
    media: typeof r.media === "boolean" ? r.media : d.media,
    speaksAs: r.speaksAs === "assistant" ? "assistant" : "manager",
    botName: name(r.botName, d.botName),
    managerName: name(r.managerName, d.managerName),
    facts: typeof r.facts === "string" ? r.facts.slice(0, 2000) : d.facts,
    productionDays: int(r.productionDays, 1, 30, d.productionDays),
    selfImprove: typeof r.selfImprove === "boolean" ? r.selfImprove : d.selfImprove,
    // Пишет клиенту сам — приезжает выключенным (решение владельца по P0).
    remind: r.remind === true,
    lastStart: r.lastStart === true,
    remindMaxDays: int(r.remindMaxDays, 1, 180, d.remindMaxDays),
    remindTouches: int(r.remindTouches, 1, REMIND_TOUCHES_MAX, d.remindTouches),
  };
}

/**
 * Сохранённый текст голосом нужного автора: заводской текст другого голоса (владелец его не правил) заменяется
 * заводским текстом этого голоса; свой текст владельца — как есть; пусто — заводской.
 */
function voiced(stored: string, assistant: string, manager: string | undefined, speaksAs: BotSpeaksAs): string {
  const own = stored.trim();
  if (!manager) return own || assistant;
  if (speaksAs === "manager") return !own || own === assistant ? manager : own;
  return !own || own === manager ? assistant : own;
}

/** Текст бота на языке клиента; пустой казахский — заводской казахский, а не русский. Голос — speaksAs. */
export function botText(config: BotConfig, lang: BotLang, key: BotTextKey) {
  return voiced(config.texts[lang][key], defaultTexts[lang][key], managerVoiceTexts[lang][key], config.sell.speaksAs);
}

/** Ответы на частые вопросы голосом менеджера: «назову», «пришлю» вместо «менеджер назовёт». */
export const managerVoiceFaq: Partial<Record<FaqIntent, Record<BotLang, string>>> = {
  price: {
    ru: defaultFaq.price.text.ru.replace("Точную сумму с учётом акции и доставки менеджер назовёт в ответе.", "Точную сумму с учётом акции и доставки назову в ответе."),
    kk: defaultFaq.price.text.kk.replace("Акция мен жеткізуді ескергендегі нақты соманы менеджер жауабында айтады.", "Акция мен жеткізуді ескергендегі нақты соманы жауабымда айтамын."),
  },
  payment: {
    ru: defaultFaq.payment.text.ru.replace("Оплата — по счёту, который пришлёт менеджер:", "Оплата — по счёту, который я пришлю:").replace("Про предоплату и рассрочку менеджер расскажет в ответе.", "Про предоплату и рассрочку расскажу в ответе."),
    kk: defaultFaq.payment.text.kk.replace("Төлем менеджер жіберетін шот арқылы жүреді:", "Төлем мен жіберетін шот арқылы жүреді:").replace("Алдын ала төлем мен бөліп төлеу туралы менеджер жауабында айтады.", "Алдын ала төлем мен бөліп төлеу туралы жауабымда айтамын."),
  },
};

/**
 * Настройки бота голосом speaksAs: заводские тексты и ответы другого голоса (которые владелец не правил) — заводскими
 * этого. Для формы настроек: при переключении «от чьего имени» поля показывают то, что бот действительно напишет.
 */
export function revoiceConfig(config: BotConfig, speaksAs: BotSpeaksAs): BotConfig {
  const texts = Object.fromEntries(
    BOT_LANGS.map((lang) => [lang, Object.fromEntries((Object.keys(defaultTexts[lang]) as BotTextKey[]).map((k) => [k, managerVoiceTexts[lang][k] ? voiced(config.texts[lang][k], defaultTexts[lang][k], managerVoiceTexts[lang][k], speaksAs) : config.texts[lang][k]]))]),
  ) as unknown as BotConfig["texts"];
  const faq = Object.fromEntries(
    (Object.keys(config.faq) as FaqIntent[]).map((i) => {
      const mine = managerVoiceFaq[i];
      if (!mine) return [i, config.faq[i]];
      return [i, { ...config.faq[i], text: Object.fromEntries(BOT_LANGS.map((lang) => [lang, voiced(config.faq[i].text[lang], defaultFaq[i].text[lang], mine[lang], speaksAs)])) }];
    }),
  ) as BotConfig["faq"];
  return { ...config, texts, faq, sell: { ...config.sell, speaksAs } };
}

/** Вопрос на языке клиента: пустой казахский → заводской казахский этого поля → русский. */
export function questionFor(q: BotQuestion, lang: BotLang) {
  if (lang === "kk") return q.text.kk.trim() || factoryQuestion(q.field)?.text.kk || q.text.ru;
  return q.text.ru.trim() || q.text.kk;
}

/** Ответ на частый вопрос на языке клиента. */
export function faqFor(config: BotConfig, intent: FaqIntent, lang: BotLang) {
  return voiced(config.faq[intent].text[lang], defaultFaq[intent].text[lang], managerVoiceFaq[intent]?.[lang], config.sell.speaksAs);
}

/** Строка акции на языке клиента: пустая казахская — русская (акцию пишет владелец, заводского перевода у неё нет). */
export function promoFor(config: BotConfig, lang: BotLang) {
  return config.promo[lang].trim() || config.promo.ru.trim();
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
