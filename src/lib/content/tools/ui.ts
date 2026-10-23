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
      title: "Бесплатные инструменты: счётчик дней вместе, поздравления, тесты",
      description: "Сколько вы вместе, как называется годовщина, когда заказать подарок к празднику, тест на знание близких, генератор поздравлений и вопросы для разговора. Бесплатно и без регистрации.",
    },
    hubH1: "Бесплатные инструменты",
    hubAccent: "для тех, кто дарит со смыслом",
    hubLead: "Посчитайте, сколько вы вместе, составьте поздравление, проверьте, как хорошо знаете маму, и узнайте, когда заказывать подарок. Всё работает в браузере, бесплатно и без регистрации.",
    hubGuides: "Статьи по теме",
    homeEyebrow: "Бесплатно",
    homeTitle: "Полезные мелочи для тех, кто дарит",
    homeNote: "Без регистрации: счётчик дней вместе, поздравления, тесты и расчёт сроков.",
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
      title: "Тегін құралдар: бірге өткен күндер санағышы, құттықтаулар, тесттер",
      description: "Бірге қанша болғаныңыз, жылдық қалай аталады, мерекеге сыйлыққа қашан тапсырыс беру керек, жақындарды білу тесті, құттықтау генераторы және әңгімеге арналған сұрақтар. Тегін және тіркелусіз.",
    },
    hubH1: "Тегін құралдар",
    hubAccent: "мәнді сыйлайтындарға арналған",
    hubLead: "Бірге қанша болғаныңызды санаңыз, құттықтау жасаңыз, анаңызды қаншалықты білетініңізді тексеріңіз және сыйлыққа қашан тапсырыс беру керегін біліңіз. Бәрі браузерде, тегін және тіркелусіз жұмыс істейді.",
    hubGuides: "Тақырып бойынша мақалалар",
    homeEyebrow: "Тегін",
    homeTitle: "Сыйлайтындарға арналған пайдалы ұсақ-түйектер",
    homeNote: "Тіркелусіз: бірге өткен күндер санағышы, құттықтаулар, тесттер және мерзім есебі.",
    all: "Барлық құралдар",
    appName: (label) => label,
  },
};
