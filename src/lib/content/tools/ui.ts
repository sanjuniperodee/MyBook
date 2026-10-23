/**
 * Подписи интерфейса инструментов. Тексты каждого языка написаны отдельно; даты собирает dateFor (одинаково на сервере и в браузере).
 * Русские формы после числа — ruPlural, в казахском форма одна.
 */
import type { Locale } from "@/i18n/config";
import { ruPlural } from "@/i18n/plural";

const n = (v: number) => v.toLocaleString("ru-RU");
const ruDays = (v: number) => `${n(v)} ${ruPlural(v, "день", "дня", "дней")}`;

export interface TogetherUi {
  dateLabel: string;
  modeLabel: string;
  modeRelationship: string;
  modeWedding: string;
  empty: string;
  future: string;
  daysTogether: (days: number) => string;
  breakdown: (y: number, m: number, d: number) => string;
  extra: (weeks: number, hours: number) => string;
  nextTitle: string;
  done: string;
  today: string;
  inDays: (d: number) => string;
  milestone: (kind: "days" | "years", value: number) => string;
  weddingNow: (year: number, name: string) => string;
  weddingNext: (year: number, name: string) => string;
  copy: string;
  copied: string;
  shareText: (days: number, breakdown: string) => string;
  tableTitle: string;
  tableLead: string;
  tableYear: (years: number) => string;
  tableName: (name: string) => string;
}

export interface DeadlineUi {
  dateLabel: string;
  deliveryLabel: string;
  delivery: Record<"courier" | "post" | "pickup" | "abroad", string>;
  empty: string;
  invalid: string;
  past: string;
  relaxed: (by: string, left: number) => string;
  soon: (by: string, left: number) => string;
  urgent: (by: string, left: number) => string;
  express: (by: string, price: string | null) => string;
  digital: string;
  detail: (days: number) => string;
  note: string;
  calendarTitle: string;
  calendarLead: string;
  holiday: Record<string, string>;
  orderBy: string;
  daysLeft: (n: number) => string;
  passed: string;
  tooLate: string;
}

export interface PriceUi {
  formatLabel: string;
  copiesLabel: string;
  extrasLabel: string;
  plan: Record<"digital" | "hardcover" | "premium", string>;
  planNote: Record<"digital" | "hardcover" | "premium", string>;
  addon: Record<"express" | "giftwrap", string>;
  addonNote: Record<"express" | "giftwrap", string>;
  deliveryLabel: string;
  deliveryNote: string;
  total: string;
  breakdown: {
    book: string;
    extraCopies: (n: number) => string;
    addons: string;
  };
  printedOnly: string;
  cta: string;
}

export interface GreetingUi {
  whoLabel: string;
  occasionLabel: string;
  toneLabel: string;
  nameLabel: string;
  namePlaceholder: string;
  ageLabel: string;
  lengthLabel: string;
  recipient: Record<string, string>;
  occasion: Record<string, string>;
  tone: Record<"warm" | "funny", string>;
  length: Record<"full" | "short", string>;
  another: string;
  copy: string;
  copied: string;
  resultTitle: string;
  hint: string;
}

export interface CardsUi {
  themeLabel: string;
  theme: Record<string, string>;
  next: string;
  shuffle: string;
  card: (i: number, total: number) => string;
  chapter: string;
  copyAll: string;
  copied: string;
  listTitle: string;
  print: string;
  tenTitle: string;
  hint: string;
}

export interface QuizUi {
  start: string;
  intro: (n: number) => string;
  question: (i: number, total: number, know: string) => string;
  answers: [string, string, string];
  back: string;
  resultTitle: string;
  percent: (p: number) => string;
  bands: [string, string, string, string];
  bandText: (band: 0 | 1 | 2 | 3, who: { about: string; acc: string }) => string;
  askTitle: string;
  askLead: string;
  perfect: string;
  retry: string;
  copy: string;
  copied: string;
  shareText: (p: number, who: { about: string; acc: string }) => string;
}

const ru = {
  together: {
    dateLabel: "Дата, с которой отсчитываем",
    modeLabel: "Что считаем",
    modeRelationship: "Отношения",
    modeWedding: "Свадьба",
    empty: "Выберите дату — и счётчик покажет, сколько вы вместе.",
    future: "Эта дата ещё впереди. Выберите день, который уже прошёл.",
    daysTogether: (d) => ruPlural(d, "день вместе", "дня вместе", "дней вместе"),
    breakdown: (y, m, d) => [y ? `${y} ${ruPlural(y, "год", "года", "лет")}` : "", m ? `${m} ${ruPlural(m, "месяц", "месяца", "месяцев")}` : "", d || (!y && !m) ? ruDays(d) : ""].filter(Boolean).join(", "),
    extra: (w, h) => `Это ${n(w)} ${ruPlural(w, "неделя", "недели", "недель")} или ${n(h)} ${ruPlural(h, "час", "часа", "часов")}.`,
    nextTitle: "Круглые даты",
    done: "уже было",
    today: "сегодня!",
    inDays: (d) => (d === 1 ? "завтра" : `через ${ruDays(d)}`),
    milestone: (kind, v) => (kind === "days" ? ruDays(v) : `${v} ${ruPlural(v, "год", "года", "лет")} вместе`),
    weddingNow: (y, name) => `${y} ${ruPlural(y, "год", "года", "лет")} в браке — это ${name.toLowerCase()} свадьба.`,
    weddingNext: (y, name) => `Следующая именная годовщина — ${y} ${ruPlural(y, "год", "года", "лет")}: ${name.toLowerCase()} свадьба.`,
    copy: "Скопировать результат",
    copied: "Скопировано",
    shareText: (days, b) => `Мы вместе уже ${n(days)} ${ruPlural(days, "день", "дня", "дней")} (${b}) 💛`,
    tableTitle: "Названия годовщин свадьбы по годам",
    tableLead: "Традиционные названия идут от материалов: чем дольше брак, тем прочнее и ценнее материал.",
    tableYear: (y) => `${y} ${ruPlural(y, "год", "года", "лет")}`,
    tableName: (name) => `${name} свадьба`,
  } satisfies TogetherUi,
  deadline: {
    dateLabel: "Когда нужно вручить подарок",
    deliveryLabel: "Как получите книгу",
    delivery: { courier: "Курьер по городу", post: "По Казахстану (СДЭК, Казпочта)", pickup: "Самовывоз в Алматы", abroad: "В другую страну" },
    empty: "Укажите дату — подскажем, до какого дня заказать печатную книгу.",
    invalid: "Не удалось разобрать дату. Выберите её в календаре.",
    past: "Эта дата уже прошла. Выберите будущий день.",
    relaxed: (by, left) => `Времени достаточно. Закажите печатную книгу до ${by} (${ruDays(left)}) — и она приедет вовремя.`,
    soon: (by, left) => `Пора начинать. Заказать печатную книгу нужно до ${by} — осталось ${ruDays(left)}.`,
    urgent: (by, left) => `Срочно! Последний день заказа — ${by}${left === 0 ? " (сегодня)" : ` (осталось ${ruDays(left)})`}. Допишите книгу и оформите заказ.`,
    express: (by, price) => `Обычная печать уже не успевает, но успеет экспресс-печать (3–4 рабочих дня${price ? `, +${price}` : ""}). Закажите до ${by}.`,
    digital: "Печатная книга к этой дате уже не успеет. Электронную версию получите сразу после оплаты и подарите в нужный день, а печатную вручите чуть позже.",
    detail: (d) => `До праздника ${ruDays(d)}.`,
    note: "Расчёт учитывает производство, доставку и день запаса на проверку макета. Время на то, чтобы написать книгу, в него не входит.",
    calendarTitle: "Когда заказывать к главным праздникам",
    calendarLead: "Ближайшие праздники и последний день заказа печатной книги с доставкой курьером.",
    holiday: {
      valentine: "День святого Валентина",
      defender: "23 февраля",
      march8: "8 Марта",
      nauryz: "Наурыз",
      defenderKz: "День защитника Отечества",
      victory: "День Победы",
      knowledge: "День знаний",
      teachers: "День учителя",
      newyear: "Новый год",
    },
    orderBy: "Заказать до",
    daysLeft: (d) => (d === 0 ? "сегодня" : `осталось ${ruDays(d)}`),
    passed: "срок вышел",
    tooLate: "только электронная",
  } satisfies DeadlineUi,
  price: {
    formatLabel: "Формат книги",
    copiesLabel: "Сколько экземпляров",
    extrasLabel: "Дополнительно",
    plan: { digital: "Электронная", hardcover: "Твёрдая обложка", premium: "Премиум" },
    planNote: { digital: "PDF сразу после оплаты", hardcover: "Печать в твёрдом переплёте + PDF", premium: "Дизайнерская бумага и подарочная коробка" },
    addon: { express: "Экспресс-печать", giftwrap: "Подарочная упаковка" },
    addonNote: { express: "3–4 рабочих дня вне очереди", giftwrap: "Крафтовая коробка, лента и открытка" },
    deliveryLabel: "Доставка",
    deliveryNote: "Самовывоз из студии в Алматы бесплатный. Курьер, доставка по Казахстану и в другие страны считаются индивидуально — зависят от города и перевозчика, сумму назовёт менеджер, в итог она не входит.",
    total: "Итого",
    breakdown: { book: "Книга", extraCopies: (c) => `Ещё ${c} ${ruPlural(c, "экземпляр", "экземпляра", "экземпляров")}`, addons: "Дополнения" },
    printedOnly: "Только для печатной книги",
    cta: "Создать книгу бесплатно",
  } satisfies PriceUi,
  greeting: {
    whoLabel: "Кого поздравляем",
    occasionLabel: "Повод",
    toneLabel: "Настроение",
    nameLabel: "Имя (необязательно)",
    namePlaceholder: "Например, Айгуль",
    ageLabel: "Сколько лет (для юбилея)",
    lengthLabel: "Длина",
    recipient: { mama: "Маму", papa: "Папу", babushka: "Бабушку", dedushka: "Дедушку", zhena: "Жену", muzh: "Мужа", podruga: "Подругу", drug: "Друга", uchitelnitsa: "Учительницу", uchitel: "Учителя" },
    occasion: { birthday: "День рождения", jubilee: "Юбилей", march8: "8 Марта", defender: "23 февраля", teachers: "День учителя", anniversary: "Годовщина свадьбы", newyear: "Новый год" },
    tone: { warm: "Тёплое", funny: "С юмором" },
    length: { full: "Полное", short: "Короткое (для сообщения)" },
    another: "Другой вариант",
    copy: "Скопировать",
    copied: "Скопировано",
    resultTitle: "Ваше поздравление",
    hint: "Текст можно править: подставьте детали, которые знаете только вы, — имя собаки, любимую шутку, общий случай. Такое поздравление запоминается.",
  } satisfies GreetingUi,
  cards: {
    themeLabel: "О ком спрашиваем",
    theme: { mom: "Маму", dad: "Папу", love: "Любимого человека", friend: "Друга", autobiography: "Бабушку, дедушку, себя", teacher: "Учителя" },
    next: "Следующий вопрос",
    shuffle: "10 случайных вопросов",
    card: (i, t) => `Вопрос ${i} из ${t}`,
    chapter: "Тема",
    copyAll: "Скопировать список",
    copied: "Скопировано",
    listTitle: "Ваша подборка",
    print: "Распечатать",
    tenTitle: "10 вопросов для разговора",
    hint: "Задавайте по одному и записывайте ответы — на диктофон или в заметки. Лучшие истории рождаются из уточняющих «а что было потом?».",
  } satisfies CardsUi,
  quiz: {
    start: "Начать тест",
    intro: (c) => `${c} утверждений. Отвечайте честно: никто не увидит результат, кроме вас.`,
    question: (_i, _t, know) => `Вы знаете ${know}?`,
    answers: ["Да, точно", "Примерно", "Нет"],
    back: "Назад",
    resultTitle: "Ваш результат",
    percent: (p) => `${p}%`,
    bands: ["Время начать разговор", "Многое знаете — есть что открыть", "Вы очень близки", "Вы знаете как никто"],
    bandText: (b, w) =>
      [
        `О ${w.about} вы знаете пока немного — и это не упрёк, а повод. Самое интересное ещё впереди: начните с вопросов ниже.`,
        `Вы знаете многое, но остались вопросы, ответов на которые вы ещё не слышали. Начните с тех, что ниже.`,
        `Вы очень близки: большую часть историй вы уже знаете. Осталось сохранить их, пока они не растерялись.`,
        `Вы знаете ${w.acc} как мало кто. Теперь это знание можно сохранить для всей семьи — в книге.`,
      ][b],
    askTitle: "Что стоит спросить",
    askLead: "Вопросы, на которые вы не знаете ответа, — задайте их вслух или запишите ответы в книгу.",
    perfect: "Вы знаете ответы на все вопросы — тогда расскажите их в книге.",
    retry: "Пройти заново",
    copy: "Скопировать результат",
    copied: "Скопировано",
    shareText: (p, w) => `Я знаю ${w.acc} на ${p}%. Проверьте, как хорошо вы знаете своих близких.`,
  } satisfies QuizUi,
};

const kk = {
  together: {
    dateLabel: "Санау басталатын күн",
    modeLabel: "Нені санаймыз",
    modeRelationship: "Қарым-қатынас",
    modeWedding: "Үйлену тойы",
    empty: "Күнді таңдаңыз — санағыш бірге қанша болғаныңызды көрсетеді.",
    future: "Бұл күн әлі келмеген. Өткен күнді таңдаңыз.",
    daysTogether: () => "күн бірге",
    breakdown: (y, m, d) => [y ? `${y} жыл` : "", m ? `${m} ай` : "", d || (!y && !m) ? `${d} күн` : ""].filter(Boolean).join(", "),
    extra: (w, h) => `Бұл ${n(w)} апта немесе ${n(h)} сағат.`,
    nextTitle: "Айтулы күндер",
    done: "өтті",
    today: "бүгін!",
    inDays: (d) => (d === 1 ? "ертең" : `${n(d)} күннен кейін`),
    milestone: (kind, v) => (kind === "days" ? `${n(v)} күн` : `${v} жыл бірге`),
    weddingNow: (y, name) => `Некеде ${y} жыл — бұл «${name}» той жылдығы.`,
    weddingNext: (y, name) => `Келесі атаулы жылдық — ${y} жыл: «${name}» той.`,
    copy: "Нәтижені көшіру",
    copied: "Көшірілді",
    shareText: (days, b) => `Біз бірге ${n(days)} күн болдық (${b}) 💛`,
    tableTitle: "Неке жылдықтарының атаулары жылдар бойынша",
    tableLead: "Дәстүрлі атаулар материалдардан шыққан: неке неғұрлым ұзақ болса, материал соғұрлым берік әрі қымбат.",
    tableYear: (y) => `${y} жыл`,
    tableName: (name) => `«${name}» той`,
  } satisfies TogetherUi,
  deadline: {
    dateLabel: "Сыйлықты қашан табыстау керек",
    deliveryLabel: "Кітапты қалай аласыз",
    delivery: { courier: "Қала ішінде курьер", post: "Қазақстан бойынша (СДЭК, Қазпочта)", pickup: "Алматыда өзі алып кету", abroad: "Басқа елге" },
    empty: "Күнді көрсетіңіз — басылған кітапты қай күнге дейін тапсырыс беру керегін айтамыз.",
    invalid: "Күнді оқу мүмкін болмады. Оны күнтізбеден таңдаңыз.",
    past: "Бұл күн өтіп кетті. Болашақ күнді таңдаңыз.",
    relaxed: (by, left) => `Уақыт жеткілікті. Басылған кітапқа ${by} дейін тапсырыс беріңіз (${left} күн қалды) — ол уақытында жетеді.`,
    soon: (by, left) => `Бастайтын кез келді. Басылған кітапқа ${by} дейін тапсырыс беру керек — ${left} күн қалды.`,
    urgent: (by, left) => `Шұғыл! Тапсырыс берудің соңғы күні — ${by}${left === 0 ? " (бүгін)" : ` (${left} күн қалды)`}. Кітапты жазып бітіріп, тапсырыс беріңіз.`,
    express: (by, price) => `Әдеттегі басып шығару үлгермейді, бірақ жедел басып шығару үлгереді (3–4 жұмыс күні${price ? `, +${price}` : ""}). ${by} дейін тапсырыс беріңіз.`,
    digital: "Басылған кітап бұл күнге үлгермейді. Электронды нұсқаны төлемнен кейін бірден аласыз да, қажет күні сыйлайсыз, ал басылғанын сәл кейін табыстайсыз.",
    detail: (d) => `Мерекеге ${d} күн қалды.`,
    note: "Есептеуде өндіріс, жеткізу және макетті тексеруге бір күн қор ескеріледі. Кітапты жазуға кететін уақыт кірмейді.",
    calendarTitle: "Негізгі мерекелерге қашан тапсырыс беру керек",
    calendarLead: "Ең жақын мерекелер және курьермен жеткізілетін басылған кітапқа тапсырыс берудің соңғы күні.",
    holiday: {
      valentine: "Әулие Валентин күні",
      defender: "23 ақпан",
      march8: "8 наурыз",
      nauryz: "Наурыз",
      defenderKz: "Отан қорғаушы күні",
      victory: "Жеңіс күні",
      knowledge: "Білім күні",
      teachers: "Ұстаздар күні",
      newyear: "Жаңа жыл",
    },
    orderBy: "Тапсырыс беру мерзімі",
    daysLeft: (d) => (d === 0 ? "бүгін" : `${d} күн қалды`),
    passed: "мерзім өтті",
    tooLate: "тек электронды",
  } satisfies DeadlineUi,
  price: {
    formatLabel: "Кітап пішімі",
    copiesLabel: "Қанша дана",
    extrasLabel: "Қосымша",
    plan: { digital: "Электронды", hardcover: "Қатты мұқаба", premium: "Премиум" },
    planNote: { digital: "Төлемнен кейін бірден PDF", hardcover: "Қатты мұқабада басылған кітап + PDF", premium: "Дизайнерлік қағаз және сыйлық қорап" },
    addon: { express: "Жедел басып шығару", giftwrap: "Сыйлық орамасы" },
    addonNote: { express: "Кезексіз, 3–4 жұмыс күнінде", giftwrap: "Крафт қорап, лента және ашықхат" },
    deliveryLabel: "Жеткізу",
    deliveryNote: "Алматыдағы студиядан өзі алып кету тегін. Курьер, Қазақстан бойынша және басқа елдерге жеткізу жеке есептеледі — қалаға және тасымалдаушыға байланысты, соманы менеджер айтады, ол қорытындыға кірмейді.",
    total: "Барлығы",
    breakdown: { book: "Кітап", extraCopies: (c) => `Тағы ${c} дана`, addons: "Қосымшалар" },
    printedOnly: "Тек басылған кітапқа",
    cta: "Кітапты тегін бастау",
  } satisfies PriceUi,
  greeting: {
    whoLabel: "Кімді құттықтаймыз",
    occasionLabel: "Себеп",
    toneLabel: "Көңіл-күй",
    nameLabel: "Аты (міндетті емес)",
    namePlaceholder: "Мысалы, Айгүл",
    ageLabel: "Неше жас (мерейтой үшін)",
    lengthLabel: "Ұзындығы",
    recipient: { mama: "Анаңызды", papa: "Әкеңізді", babushka: "Әжеңізді", dedushka: "Атаңызды", zhena: "Әйеліңізді", muzh: "Жолдасыңызды", podruga: "Құрбыңызды", drug: "Досыңызды", uchitelnitsa: "Ұстазды (әйел)", uchitel: "Ұстазды (ер)" },
    occasion: { birthday: "Туған күн", jubilee: "Мерейтой", march8: "8 наурыз", defender: "23 ақпан", teachers: "Ұстаздар күні", anniversary: "Неке жылдығы", newyear: "Жаңа жыл" },
    tone: { warm: "Жылы", funny: "Әзілмен" },
    length: { full: "Толық", short: "Қысқа (хабарламаға)" },
    another: "Басқа нұсқа",
    copy: "Көшіру",
    copied: "Көшірілді",
    resultTitle: "Сіздің құттықтауыңыз",
    hint: "Мәтінді түзетуге болады: тек өзіңіз білетін бөлшектерді қосыңыз — итіңіздің аты, сүйікті әзіл, ортақ оқиға. Мұндай құттықтау есте қалады.",
  } satisfies GreetingUi,
  cards: {
    themeLabel: "Кім туралы сұраймыз",
    theme: { mom: "Ана", dad: "Әке", love: "Сүйікті адам", friend: "Дос", autobiography: "Әже, ата, өзіңіз", teacher: "Ұстаз" },
    next: "Келесі сұрақ",
    shuffle: "10 кездейсоқ сұрақ",
    card: (i, t) => `${t} сұрақтың ${i}-і`,
    chapter: "Тақырып",
    copyAll: "Тізімді көшіру",
    copied: "Көшірілді",
    listTitle: "Сіздің іріктемеңіз",
    print: "Басып шығару",
    tenTitle: "Әңгімеге арналған 10 сұрақ",
    hint: "Сұрақтарды біртіндеп қойып, жауаптарын дауыс жазғышқа немесе жазбаға жазып алыңыз. Ең жақсы әңгімелер «ал содан кейін не болды?» деген нақтылаушы сұрақтан туады.",
  } satisfies CardsUi,
  quiz: {
    start: "Тестті бастау",
    intro: (c) => `${c} тұжырым. Шын жауап беріңіз: нәтижені сізден басқа ешкім көрмейді.`,
    question: (_i, _t, know) => `Сіз ${know} білесіз бе?`,
    answers: ["Иә, нақты", "Шамамен", "Жоқ"],
    back: "Артқа",
    resultTitle: "Сіздің нәтижеңіз",
    percent: (p) => `${p}%`,
    bands: ["Әңгімені бастайтын кез", "Көп білесіз — ашатыны да бар", "Сіз өте жақынсыз", "Сіз бәрінен жақсы білесіз"],
    bandText: (b, w) =>
      [
        `${w.about[0].toUpperCase()}${w.about.slice(1)} туралы сіз әзірше аз білесіз — бұл сөгіс емес, себеп. Ең қызығы алда: төмендегі сұрақтардан бастаңыз.`,
        `Сіз көп білесіз, бірақ жауабын естімеген сұрақтар қалды. Төмендегілерден бастаңыз.`,
        `Сіз өте жақынсыз: әңгімелердің көбін білесіз. Енді оларды жоғалмай тұрып сақтап қалу керек.`,
        `Сіз ${w.acc} аз кісідей білесіз. Енді осы білімді бүкіл отбасы үшін кітапта сақтауға болады.`,
      ][b],
    askTitle: "Нені сұрау керек",
    askLead: "Жауабын білмейтін сұрақтар — оларды дауыстап қойыңыз немесе жауаптарын кітапқа жазыңыз.",
    perfect: "Сіз барлық сұрақтың жауабын білесіз — онда оларды кітапта айтып беріңіз.",
    retry: "Қайтадан өту",
    copy: "Нәтижені көшіру",
    copied: "Көшірілді",
    shareText: (p, w) => `Мен ${w.acc} ${p}% білемін. Жақындарыңызды қаншалықты жақсы білетініңізді тексеріп көріңіз.`,
  } satisfies QuizUi,
};

interface ToolUi {
  together: TogetherUi;
  deadline: DeadlineUi;
  price: PriceUi;
  greeting: GreetingUi;
  cards: CardsUi;
  quiz: QuizUi;
}

export const toolUi: Record<Locale, ToolUi> = { ru, kk };

/** Тексты страниц инструментов: хлебные крошки, заголовки блоков и хаб /instrumenty. */
export interface ToolsPageUi {
  home: string;
  hub: string;
  free: string;
  noSignup: string;
  create: string;
  seeIdeas: string;
  others: string;
  guides: string;
  faqTitle: string;
  open: string;
  hubMeta: { title: string; description: string };
  hubH1: string;
  hubAccent: string;
  hubLead: string;
  hubGuides: string;
  homeEyebrow: string;
  homeTitle: string;
  homeNote: string;
  all: string;
  appName: (label: string) => string;
}

export const toolsPageUi: Record<Locale, ToolsPageUi> = {
  ru: {
    home: "Главная",
    hub: "Инструменты",
    free: "Бесплатно",
    noSignup: "Без регистрации",
    create: "Создать книгу",
    seeIdeas: "Идеи подарков",
    others: "Другие инструменты",
    guides: "Читайте также",
    faqTitle: "Вопросы",
    open: "Открыть",
    hubMeta: {
      title: "Бесплатные инструменты: проверка фото для печати, шежіре, план книги",
      description: "Проверка фото для печати, план книги к дате с календарём, объём и толщина книги, шежіре до седьмого колена, расчёт цены, счётчик дней вместе. Бесплатно и без регистрации.",
    },
    hubH1: "Бесплатные инструменты",
    hubAccent: "для тех, кто дарит со смыслом",
    hubLead: "Проверьте, подойдут ли фото для печати, составьте план книги к дате, узнайте, сколько страниц получится, и соберите родословную до седьмого колена. Ещё — счётчик дней вместе, поздравления и тесты. Всё работает в браузере, бесплатно и без регистрации.",
    hubGuides: "Статьи по теме",
    homeEyebrow: "Бесплатно",
    homeTitle: "Бесплатные инструменты для тех, кто делает книгу",
    homeNote: "Без регистрации: проверка фото, план книги, объём, шежіре и другие.",
    all: "Все инструменты",
    appName: (label) => label,
  },
  kk: {
    home: "Басты бет",
    hub: "Құралдар",
    free: "Тегін",
    noSignup: "Тіркелусіз",
    create: "Кітап жасау",
    seeIdeas: "Сыйлық идеялары",
    others: "Басқа құралдар",
    guides: "Мұны да оқыңыз",
    faqTitle: "Сұрақтар",
    open: "Ашу",
    hubMeta: {
      title: "Тегін құралдар: суретті тексеру, шежіре, кітап жоспары",
      description: "Басып шығаруға суретті тексеру, күнтізбесі бар кітап жоспары, кітаптың көлемі мен қалыңдығы, жеті атаға дейінгі шежіре, баға есебі, бірге өткен күндер санағышы. Тегін және тіркелусіз.",
    },
    hubH1: "Тегін құралдар",
    hubAccent: "мәнді сыйлайтындарға арналған",
    hubLead: "Суреттердің басып шығаруға жарайтынын тексеріңіз, күнге кітап жоспарын құрыңыз, неше бет шығатынын біліңіз және жетінші буынға дейін шежіре жинаңыз. Тағы — бірге өткен күндер санағышы, құттықтаулар және тесттер. Бәрі браузерде, тегін және тіркелусіз жұмыс істейді.",
    hubGuides: "Тақырып бойынша мақалалар",
    homeEyebrow: "Тегін",
    homeTitle: "Кітап жасайтындарға арналған тегін құралдар",
    homeNote: "Тіркелусіз: суретті тексеру, кітап жоспары, көлем, шежіре және басқалар.",
    all: "Барлық құралдар",
    appName: (label) => label,
  },
};

/* ───────── Полезные инструменты: проверка фото, объём книги, план к дате, шежіре ───────── */

export interface PhotoUi {
  dropTitle: string;
  dropHint: string;
  privacy: string;
  formatLabel: string;
  format: Record<"a5" | "square", string>;
  use: Record<"bleed" | "full" | "half" | "grid" | "cover", string>;
  verdict: Record<"great" | "ok" | "low", string>;
  headline: Record<"great" | "ok" | "low", string>;
  size: (w: number, h: number, mpx: string, mb: string) => string;
  maxSize: (sharp: number, soft: number) => string;
  messenger: string;
  unreadable: (name: string) => string;
  summary: (total: number, any: number, limited: number) => string;
  clear: string;
  tipsTitle: string;
  tips: string[];
}

export interface PagesUi {
  formatLabel: string;
  format: Record<"a5" | "square", string>;
  answersLabel: string;
  lengthLabel: string;
  length: Record<"short" | "medium" | "long", string>;
  photosLabel: string;
  lettersLabel: string;
  pages: string;
  spine: (mm: string) => string;
  words: (n: number) => string;
  state: Record<"empty" | "thin" | "good" | "thick", string>;
  stateText: Record<"empty" | "thin" | "good" | "thick", string>;
  addMore: (n: number) => string;
  minNote: (n: number) => string;
  note: string;
  cta: string;
}

export interface PlanUi {
  dateLabel: string;
  deliveryLabel: string;
  delivery: Record<"courier" | "post" | "pickup" | "abroad", string>;
  goalLabel: string;
  goal: Record<"short" | "normal" | "big", string>;
  lettersLabel: string;
  empty: string;
  invalid: string;
  verdict: Record<"past" | "calm" | "tight" | "hard" | "express" | "digital", (perDay: number) => string>;
  stepsTitle: string;
  step: Record<"start" | "letters" | "photos" | "answers" | "check" | "order" | "target", { title: string; text: (perDay: number) => string }>;
  daysLeft: (d: number) => string;
  ics: string;
  copy: string;
  copied: string;
  icsName: string;
  icsPrefix: string;
  copyHeader: (date: string) => string;
}

export interface ShezhireUi {
  ownerLabel: string;
  ownerPlaceholder: string;
  clanLabel: string;
  clanPlaceholder: string;
  lineLabel: string;
  line: Record<"father" | "mother", string>;
  generation: (i: number, line: "father" | "mother") => string;
  nameLabel: string;
  yearsLabel: string;
  placeLabel: string;
  yearsPlaceholder: string;
  progress: (n: number, total: number) => string;
  chain: (n: number) => string;
  askTitle: string;
  ask: (i: number, line: "father" | "mother") => string;
  treeTitle: string;
  treeEmpty: string;
  unknown: string;
  print: string;
  copy: string;
  copied: string;
  clear: string;
  clearConfirm: string;
  saved: string;
  printTitle: (owner: string) => string;
  printLine: Record<"father" | "mother", string>;
  clanPrefix: string;
  you: string;
  privacy: string;
}

const ruLen = (n: number, one: string, few: string, many: string) => `${n} ${ruPlural(n, one, few, many)}`;

const usefulRu = {
  photo: {
    dropTitle: "Выберите фото или перетащите сюда",
    dropHint: "Можно сразу много снимков. JPG, PNG, WebP.",
    privacy: "Снимки не загружаются на сервер: проверка идёт в вашем браузере.",
    formatLabel: "Формат книги",
    format: { a5: "A5 (148×210 мм)", square: "Квадрат (200×200 мм)" },
    use: { bleed: "На всю страницу (под обрез)", full: "На странице с полями", half: "Половина страницы", grid: "В сетке из четырёх", cover: "На обложке" },
    verdict: { great: "чётко", ok: "приемлемо", low: "нечётко" },
    headline: { great: "Подходит для печати", ok: "Подойдёт, но не везде", low: "Мало пикселей" },
    size: (w, h, mpx, mb) => `${w}×${h} px · ${mpx} Мп · ${mb} МБ`,
    maxSize: (s, o) => `Без потери чёткости можно печатать до ${s} см по длинной стороне, терпимо — до ${o} см.`,
    messenger: "Похоже, это копия из мессенджера: при пересылке в WhatsApp или Telegram фото сжимается. Попросите прислать оригинал «файлом» или «документом».",
    unreadable: (name) => `Не удалось прочитать «${name}». Если это фото с iPhone в формате HEIC, сохраните его как JPG.`,
    summary: (t, a, l) => `Проверено ${t} ${ruPlural(t, "фото", "фото", "фото")}: ${a} подойдут на любое место${l ? `, ${l} — только на страницу с полями или меньше, а на всю страницу и на обложку лучше взять оригинал` : ""}.`,
    clear: "Очистить",
    tipsTitle: "Как получить фото получше",
    tips: [
      "Просите прислать оригинал: в WhatsApp и Telegram выбирайте «Файл» или «Документ», а не «Фото».",
      "Со старых бумажных снимков делайте скан на 600 dpi или съёмку при хорошем свете без вспышки.",
      "Снимки из соцсетей сжаты: для книги берите оригиналы с телефона или из облака.",
      "Не увеличивайте фото в редакторах и не сжимайте повторно: пикселей от этого не прибавится.",
    ],
  } satisfies PhotoUi,
  pages: {
    formatLabel: "Формат книги",
    format: { a5: "A5 (148×210 мм)", square: "Квадрат (200×200 мм)" },
    answersLabel: "Сколько ответов вы напишете",
    lengthLabel: "Длина ответа",
    length: { short: "Короткий, ~50 слов", medium: "Средний, ~120 слов", long: "Развёрнутый, ~250 слов" },
    photosLabel: "Сколько фото в ответах",
    lettersLabel: "Писем от близких",
    pages: "страниц в книге",
    spine: (mm) => `толщина корешка ~${mm} мм`,
    words: (n) => `около ${n.toLocaleString("ru-RU")} слов текста`,
    state: { empty: "Пока пусто", thin: "Тонкая книга", good: "Полноценная книга", thick: "Очень большая книга" },
    stateText: {
      empty: "Добавьте ответы или фото — калькулятор покажет объём.",
      thin: "Материала мало: книга выйдет тонкой, часть страниц останется пустой — их добавляют до минимального объёма. Добавьте ответов или фото.",
      good: "Хороший объём: книга получится цельной, с главами и фото.",
      thick: "Очень большая книга. Это возможно, но печать и доставка будут тяжелее — подумайте, не разбить ли её на две.",
    },
    addMore: (n) => `Ещё ${ruLen(n, "ответ", "ответа", "ответов")} — и книга станет полноценной (от 40 страниц).`,
    minNote: (n) => `Минимальный печатный объём — ${n} страниц, дальше — кратно четырём. Недостающие страницы печатаются пустыми.`,
    note: "Это оценка по тому же расчёту, что в редакторе. Реальный объём зависит от текста и расстановки фото. Цена книги от числа страниц не зависит.",
    cta: "Начать книгу бесплатно",
  } satisfies PagesUi,
  plan: {
    dateLabel: "Когда нужно вручить книгу",
    deliveryLabel: "Как получите книгу",
    delivery: { courier: "Курьер по городу", post: "По Казахстану (СДЭК, Казпочта)", pickup: "Самовывоз в Алматы", abroad: "В другую страну" },
    goalLabel: "Какую книгу делаем",
    goal: { short: "Короткая — около 15 ответов", normal: "Обычная — около 30 ответов", big: "Большая — около 50 ответов" },
    lettersLabel: "Соберу письма от близких",
    empty: "Укажите дату — составим план: что и когда сделать.",
    invalid: "Не удалось разобрать дату. Выберите её в календаре.",
    verdict: {
      past: () => "Эта дата уже прошла. Выберите будущий день.",
      calm: (p) => `Времени достаточно: хватит ${ruLen(p, "ответа", "ответов", "ответов")} в день. Книга успеет спокойно.`,
      tight: (p) => `Успеете, но без лишнего запаса: нужно писать около ${ruLen(p, "ответа", "ответов", "ответов")} в день.`,
      hard: (p) => `Сложно: потребуется ${ruLen(p, "ответ", "ответа", "ответов")} в день. Лучше выбрать короткую книгу или попросить помощи — родные могут отвечать на вопросы по ссылке.`,
      express: () => "Обычная печать не успеет, но успеет экспресс-печать (3–4 рабочих дня, за доплату). План ниже построен под неё.",
      digital: () => "Печатная книга к этой дате не успеет. Электронную версию получите сразу — подарите её в нужный день, а печатную вручите позже.",
    },
    stepsTitle: "План по датам",
    step: {
      start: { title: "Начать книгу", text: () => "Выберите тему и обложку и ответьте на первые вопросы." },
      letters: { title: "Разослать просьбы о письмах", text: () => "Отправьте близким ссылку: письмо пишется с телефона, регистрация не нужна." },
      photos: { title: "Собрать фото", text: () => "Загрузите оригиналы снимков и расставьте их по главам." },
      answers: { title: "Закончить ответы", text: (p) => `Пишите примерно по ${ruLen(p, "ответу", "ответа", "ответов")} в день, можно голосом.` },
      check: { title: "Проверить макет", text: () => "Пролистайте PDF-макет всех страниц, проверьте текст и фото." },
      order: { title: "Оформить заказ — последний день", text: () => "Позже печатная книга к дате не успеет." },
      target: { title: "День вручения", text: () => "Книга у вас в руках." },
    },
    daysLeft: (d) => (d === 0 ? "сегодня" : d === 1 ? "завтра" : `через ${ruLen(d, "день", "дня", "дней")}`),
    ics: "Скачать в календарь (.ics)",
    copy: "Скопировать план",
    copied: "Скопировано",
    icsName: "plan-knigi.ics",
    icsPrefix: "Книга",
    copyHeader: (d) => `План книги к ${d}:`,
  } satisfies PlanUi,
  shezhire: {
    ownerLabel: "Чья родословная",
    ownerPlaceholder: "Ваше имя",
    clanLabel: "Род и жуз (по желанию)",
    clanPlaceholder: "Например, Арғын, Орта жүз",
    lineLabel: "Линия",
    line: { father: "По отцу (жеті ата)", mother: "По матери (нағашы)" },
    generation: (i, line) => {
      const father = ["Отец", "Дед (отец отца)", "Прадед", "Прапрадед", "5-е колено", "6-е колено", "7-е колено"];
      const mother = ["Мать", "Дед по матери", "Прадед по матери", "Прапрадед по матери", "5-е колено", "6-е колено", "7-е колено"];
      return (line === "father" ? father : mother)[i];
    },
    nameLabel: "Имя",
    yearsLabel: "Годы жизни",
    placeLabel: "Откуда",
    yearsPlaceholder: "1930–2001",
    progress: (n, t) => `Заполнено ${n} из ${t}`,
    chain: (n) => (n >= 7 ? "Вы знаете все семь колен — это жеті ата." : `Подряд известно колен: ${n}. Остальные можно узнать у старших родственников.`),
    askTitle: "У кого спросить",
    ask: (i, line) =>
      line === "mother"
        ? ["Спросите у мамы и её братьев и сестёр.", "Спросите у маминых родителей и старших родственников по маме.", "Спросите у старших родственников мамы: они помнят прадедов.", "Поищите в семейных документах, архивах и у аксакалов рода.", "Здесь поможет шежіре рода или районный архив.", "Спросите у старейшин рода мамы.", "Седьмое колено обычно известно только по шежіре рода."][i]
        : ["Спросите у папы и его братьев.", "Спросите у дедушки и его ровесников.", "Спросите у старших родственников по отцу: они помнят прадедов.", "Поищите в семейных документах и у аксакалов рода.", "Здесь поможет шежіре рода или районный архив.", "Спросите у старейшин рода: многие знают родословную наизусть.", "Седьмое колено обычно известно только по шежіре рода."][i],
    treeTitle: "Ваше шежіре",
    treeEmpty: "Заполните имена слева — родословная появится здесь.",
    unknown: "ещё не известно",
    print: "Распечатать",
    copy: "Скопировать текстом",
    copied: "Скопировано",
    clear: "Очистить всё",
    clearConfirm: "Стереть все введённые имена?",
    saved: "Данные хранятся только в этом браузере.",
    printTitle: (o) => (o ? `Шежіре: ${o}` : "Шежіре"),
    printLine: { father: "Линия отца — жеті ата", mother: "Линия матери — нағашы" },
    clanPrefix: "Род",
    you: "Вы",
    privacy: "Всё, что вы вводите, остаётся в вашем браузере и никуда не отправляется.",
  } satisfies ShezhireUi,
};

const usefulKk = {
  photo: {
    dropTitle: "Суретті таңдаңыз немесе осында сүйреңіз",
    dropHint: "Бірден көп сурет болады. JPG, PNG, WebP.",
    privacy: "Суреттер серверге жүктелмейді: тексеру браузеріңізде жүреді.",
    formatLabel: "Кітап пішімі",
    format: { a5: "A5 (148×210 мм)", square: "Шаршы (200×200 мм)" },
    use: { bleed: "Бүкіл бетке (кесіндіге дейін)", full: "Жиегі бар бетте", half: "Беттің жартысы", grid: "Төртеулік торда", cover: "Мұқабада" },
    verdict: { great: "анық", ok: "қолайлы", low: "анық емес" },
    headline: { great: "Басып шығаруға жарайды", ok: "Жарайды, бірақ бәріне емес", low: "Пиксель аз" },
    size: (w, h, mpx, mb) => `${w}×${h} px · ${mpx} Мп · ${mb} МБ`,
    maxSize: (s, o) => `Анықтығын жоғалтпай ұзын жағы бойынша ${s} см-ге дейін басуға болады, шыдамдылықпен — ${o} см-ге дейін.`,
    messenger: "Бұл мессенджерден келген көшірме сияқты: WhatsApp немесе Telegram арқылы жібергенде сурет сығылады. Түпнұсқаны «файл» немесе «құжат» ретінде жіберуін сұраңыз.",
    unreadable: (name) => `«${name}» файлын оқу мүмкін болмады. Егер бұл HEIC пішімді iPhone суреті болса, оны JPG ретінде сақтаңыз.`,
    summary: (t, a, l) => `${t} сурет тексерілді: ${a} кез келген орынға жарайды${l ? `, ${l} — тек жиегі бар бетке немесе кішірек орынға, ал бүкіл бетке және мұқабаға түпнұсқаны алған жөн` : ""}.`,
    clear: "Тазалау",
    tipsTitle: "Жақсырақ сурет қалай алуға болады",
    tips: [
      "Түпнұсқаны жіберуін сұраңыз: WhatsApp пен Telegram-да «Сурет» емес, «Файл» немесе «Құжат» таңдаңыз.",
      "Ескі қағаз суреттерден 600 dpi сканер жасаңыз немесе жақсы жарықта жарқылсыз түсіріңіз.",
      "Әлеуметтік желідегі суреттер сығылған: кітапқа телефондағы немесе бұлттағы түпнұсқаларды алыңыз.",
      "Суретті редакторларда үлкейтпеңіз және қайта сыспаңыз: бұдан пиксель көбеймейді.",
    ],
  } satisfies PhotoUi,
  pages: {
    formatLabel: "Кітап пішімі",
    format: { a5: "A5 (148×210 мм)", square: "Шаршы (200×200 мм)" },
    answersLabel: "Қанша жауап жазасыз",
    lengthLabel: "Жауаптың ұзындығы",
    length: { short: "Қысқа, ~50 сөз", medium: "Орташа, ~120 сөз", long: "Толық, ~250 сөз" },
    photosLabel: "Жауаптардағы суреттер саны",
    lettersLabel: "Жақындардан хаттар",
    pages: "бет кітапта",
    spine: (mm) => `жон қалыңдығы ~${mm} мм`,
    words: (n) => `шамамен ${n.toLocaleString("ru-RU")} сөз мәтін`,
    state: { empty: "Әзірше бос", thin: "Жұқа кітап", good: "Толыққанды кітап", thick: "Өте үлкен кітап" },
    stateText: {
      empty: "Жауап немесе сурет қосыңыз — есептегіш көлемді көрсетеді.",
      thin: "Материал аз: кітап жұқа болады, кейбір беттер бос қалады — оларды ең аз көлемге дейін қосады. Жауап немесе сурет қосыңыз.",
      good: "Жақсы көлем: кітап тарауларымен және суреттерімен тұтас болады.",
      thick: "Өте үлкен кітап. Бұл мүмкін, бірақ басу мен жеткізу ауырырақ болады — оны екіге бөлуді ойлаңыз.",
    },
    addMore: (n) => `Тағы ${n} жауап — және кітап толыққанды болады (40 беттен).`,
    minNote: (n) => `Ең аз басылым көлемі — ${n} бет, одан әрі — төртке еселі. Жетпейтін беттер бос басылады.`,
    note: "Бұл редактордағы есепке сай бағалау. Нақты көлем мәтінге және суреттердің орналасуына байланысты. Кітап бағасы беттер санына байланысты емес.",
    cta: "Кітапты тегін бастау",
  } satisfies PagesUi,
  plan: {
    dateLabel: "Кітапты қашан табыстау керек",
    deliveryLabel: "Кітапты қалай аласыз",
    delivery: { courier: "Қала ішінде курьер", post: "Қазақстан бойынша (СДЭК, Қазпочта)", pickup: "Алматыда өзі алып кету", abroad: "Басқа елге" },
    goalLabel: "Қандай кітап жасаймыз",
    goal: { short: "Қысқа — шамамен 15 жауап", normal: "Әдеттегі — шамамен 30 жауап", big: "Үлкен — шамамен 50 жауап" },
    lettersLabel: "Жақындардан хат жинаймын",
    empty: "Күнді көрсетіңіз — жоспар құрамыз: не және қашан істеу керек.",
    invalid: "Күнді оқу мүмкін болмады. Оны күнтізбеден таңдаңыз.",
    verdict: {
      past: () => "Бұл күн өтіп кетті. Болашақ күнді таңдаңыз.",
      calm: (p) => `Уақыт жеткілікті: күніне ${p} жауап жеткілікті. Кітап тыныш үлгереді.`,
      tight: (p) => `Үлгересіз, бірақ артық қорсыз: күніне шамамен ${p} жауап жазу керек.`,
      hard: (p) => `Қиын: күніне ${p} жауап қажет. Қысқа кітапты таңдаған немесе көмек сұраған жөн — туыстар сілтеме арқылы сұрақтарға жауап бере алады.`,
      express: () => "Әдеттегі басып шығару үлгермейді, бірақ жедел басып шығару (3–4 жұмыс күні, қосымша ақымен) үлгереді. Төмендегі жоспар соған құрылған.",
      digital: () => "Басылған кітап бұл күнге үлгермейді. Электрондық нұсқаны бірден аласыз — оны қажет күні сыйлаңыз, ал басылғанын кейін табыстаңыз.",
    },
    stepsTitle: "Күндер бойынша жоспар",
    step: {
      start: { title: "Кітапты бастау", text: () => "Тақырып пен мұқаба таңдап, алғашқы сұрақтарға жауап беріңіз." },
      letters: { title: "Хат жазуға өтініш жіберу", text: () => "Жақындарға сілтеме жіберіңіз: хатты телефоннан жазуға болады, тіркелу керек емес." },
      photos: { title: "Суреттерді жинау", text: () => "Суреттердің түпнұсқаларын жүктеп, тарауларға орналастырыңыз." },
      answers: { title: "Жауаптарды аяқтау", text: (p) => `Күніне шамамен ${p} жауап жазыңыз, дауыспен де болады.` },
      check: { title: "Макетті тексеру", text: () => "Барлық беттің PDF-макетін қарап шығып, мәтін мен суретті тексеріңіз." },
      order: { title: "Тапсырыс беру — соңғы күн", text: () => "Кейін басылған кітап күнге үлгермейді." },
      target: { title: "Табыстау күні", text: () => "Кітап қолыңызда." },
    },
    daysLeft: (d) => (d === 0 ? "бүгін" : d === 1 ? "ертең" : `${d} күннен кейін`),
    ics: "Күнтізбеге жүктеу (.ics)",
    copy: "Жоспарды көшіру",
    copied: "Көшірілді",
    icsName: "kitap-zhospary.ics",
    icsPrefix: "Кітап",
    copyHeader: (d) => `${d} күніне кітап жоспары:`,
  } satisfies PlanUi,
  shezhire: {
    ownerLabel: "Кімнің шежіресі",
    ownerPlaceholder: "Сіздің атыңыз",
    clanLabel: "Ру және жүз (қалауыңызша)",
    clanPlaceholder: "Мысалы, Арғын, Орта жүз",
    lineLabel: "Желі",
    line: { father: "Әке жағынан (жеті ата)", mother: "Ана жағынан (нағашы)" },
    generation: (i, line) => {
      const father = ["Әке", "Ата (әкенің әкесі)", "Баба", "4-ші ата", "5-ші ата", "6-шы ата", "7-ші ата"];
      const mother = ["Ана", "Нағашы ата", "Нағашының әкесі", "4-ші буын", "5-ші буын", "6-шы буын", "7-ші буын"];
      return (line === "father" ? father : mother)[i];
    },
    nameLabel: "Аты",
    yearsLabel: "Өмір сүрген жылдары",
    placeLabel: "Қайдан",
    yearsPlaceholder: "1930–2001",
    progress: (n, t) => `${t} ішінен ${n} толтырылды`,
    chain: (n) => (n >= 7 ? "Жеті атаның бәрін білесіз — бұл жеті ата." : `Қатарынан белгілі буын: ${n}. Қалғанын үлкен туыстардан білуге болады.`),
    askTitle: "Кімнен сұрау керек",
    ask: (i, line) =>
      line === "mother"
        ? ["Анаңыздан және оның аға-інілері мен апа-қарындастарынан сұраңыз.", "Ананың ата-анасынан және ана жағындағы үлкен туыстардан сұраңыз.", "Ананың үлкен туыстарынан сұраңыз: олар бабаларын есте сақтайды.", "Отбасылық құжаттардан, мұрағаттардан және ру ақсақалдарынан іздеңіз.", "Мұнда рудың шежіресі немесе аудандық мұрағат көмектеседі.", "Ана руының ақсақалдарынан сұраңыз.", "Жетінші буын әдетте тек рудың шежіресінен белгілі."][i]
        : ["Әкеңізден және оның аға-інілерінен сұраңыз.", "Атаңыздан және оның замандастарынан сұраңыз.", "Әке жағындағы үлкен туыстардан сұраңыз: олар бабаларын есте сақтайды.", "Отбасылық құжаттардан және ру ақсақалдарынан іздеңіз.", "Мұнда рудың шежіресі немесе аудандық мұрағат көмектеседі.", "Ру ақсақалдарынан сұраңыз: көбі шежірені жатқа біледі.", "Жетінші буын әдетте тек рудың шежіресінен белгілі."][i],
    treeTitle: "Сіздің шежіреңіз",
    treeEmpty: "Сол жақта аттарды толтырыңыз — шежіре осында пайда болады.",
    unknown: "әлі белгісіз",
    print: "Басып шығару",
    copy: "Мәтін ретінде көшіру",
    copied: "Көшірілді",
    clear: "Бәрін тазалау",
    clearConfirm: "Енгізілген барлық аттарды өшіру керек пе?",
    saved: "Деректер тек осы браузерде сақталады.",
    printTitle: (o) => (o ? `Шежіре: ${o}` : "Шежіре"),
    printLine: { father: "Әке желісі — жеті ата", mother: "Ана желісі — нағашы" },
    clanPrefix: "Ру",
    you: "Сіз",
    privacy: "Сіз енгізгеннің бәрі браузеріңізде қалады және ешқайда жіберілмейді.",
  } satisfies ShezhireUi,
};

export const usefulUi: Record<Locale, { photo: PhotoUi; pages: PagesUi; plan: PlanUi; shezhire: ShezhireUi }> = { ru: usefulRu, kk: usefulKk };
