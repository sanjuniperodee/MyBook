import type { Locale } from "@/i18n/config";
import { autobiographyChapters } from "./autobiography";
import { childChapters } from "./child";
import { familyChapters } from "./family";
import { friendChapters } from "./friend";
import { grandmaChapters } from "./grandma";
import { grandpaChapters } from "./grandpa";
import { loveChapters } from "./love";
import { parentChapters } from "./parent";
import { parentsChapters } from "./parents";
import { siblingChapters } from "./sibling";
import { teacherChapters } from "./teacher";
import { autobiographyChapters as autobiographyChaptersKk } from "./kk/autobiography";
import { childChapters as childChaptersKk } from "./kk/child";
import { familyChapters as familyChaptersKk } from "./kk/family";
import { friendChapters as friendChaptersKk } from "./kk/friend";
import { grandmaChapters as grandmaChaptersKk } from "./kk/grandma";
import { grandpaChapters as grandpaChaptersKk } from "./kk/grandpa";
import { loveChapters as loveChaptersKk } from "./kk/love";
import { parentChapters as parentChaptersKk } from "./kk/parent";
import { parentsChapters as parentsChaptersKk } from "./kk/parents";
import { siblingChapters as siblingChaptersKk } from "./kk/sibling";
import { teacherChapters as teacherChaptersKk } from "./kk/teacher";
import type { ChapterDef, GiftThemeId, ThemeDef, ThemeId } from "./types";

/**
 * Темы книг. Оформление (обложка, род адресата) общее, тексты — на языке книги.
 * Язык книги выбирается при создании и хранится в books.language: вопросы копируются в книгу
 * на этом языке, на нём же печатаются заголовки глав. Язык интерфейса на это не влияет.
 * Кроме подарков — автобиография (банк вопросов о жизни рассказчика) и своя книга blank: банка нет, главы и разделы
 * автор создаёт сам (book_chapters), поэтому её chapters пусты.
 */

type ThemeBase = Pick<ThemeDef, "id" | "kind" | "recipient" | "emoji" | "recipientGender" | "recipientGenderChoice" | "defaultRecipientGender" | "defaultCover" | "defaultInterior">;
type ThemeText = Omit<ThemeDef, keyof ThemeBase>;

/** Порядок важен: любимому — первой (главная считает вопросы по первой теме), новые виды — в конце. */
const base: ThemeBase[] = [
  { id: "love", kind: "gift", recipient: "required", emoji: "❤", defaultRecipientGender: "m", defaultCover: "peony", defaultInterior: "romance" },
  { id: "mom", kind: "gift", recipient: "required", emoji: "✿", recipientGender: "f", defaultRecipientGender: "f", defaultCover: "tenderness", defaultInterior: "herbarium" },
  { id: "dad", kind: "gift", recipient: "required", emoji: "✦", recipientGender: "m", defaultRecipientGender: "m", defaultCover: "alatau", defaultInterior: "stars" },
  // Родителям — сразу вдвоём: один получатель — оба имени, род адресата не спрашиваем (банк во множественном числе).
  { id: "parents", kind: "gift", recipient: "required", emoji: "❧", recipientGenderChoice: false, defaultRecipientGender: "m", defaultCover: "flax", defaultInterior: "classic" },
  // Семье — о всей семье: адресат во множественном числе, получатель — имя семьи.
  { id: "family", kind: "gift", recipient: "required", emoji: "✤", recipientGenderChoice: false, defaultRecipientGender: "m", defaultCover: "steppe", defaultInterior: "journal" },
  { id: "grandma", kind: "gift", recipient: "required", emoji: "✾", recipientGender: "f", defaultRecipientGender: "f", defaultCover: "postcards", defaultInterior: "vintage" },
  { id: "grandpa", kind: "gift", recipient: "required", emoji: "✶", recipientGender: "m", defaultRecipientGender: "m", defaultCover: "saddle", defaultInterior: "novel" },
  // Дочери или сыну: род ребёнка выбирают в мастере.
  { id: "child", kind: "gift", recipient: "required", emoji: "❀", defaultRecipientGender: "f", defaultCover: "clouds", defaultInterior: "watercolor" },
  { id: "sibling", kind: "gift", recipient: "required", emoji: "✧", defaultRecipientGender: "f", defaultCover: "lemons", defaultInterior: "album" },
  { id: "friend", kind: "gift", recipient: "required", emoji: "☀", defaultRecipientGender: "f", defaultCover: "party", defaultInterior: "confetti" },
  // Учителю: чаще дарят учительнице; осенняя обложка — к Дню учителя.
  { id: "teacher", kind: "gift", recipient: "required", emoji: "✐", defaultRecipientGender: "f", defaultCover: "autumn", defaultInterior: "editorial" },
  // Род получателя у автобиографии и своей книги не используется: в их текстах нет [..|..].
  { id: "autobiography", kind: "autobiography", recipient: "none", emoji: "❦", defaultRecipientGender: "m", defaultCover: "leather", defaultInterior: "vintage" },
  { id: "blank", kind: "blank", recipient: "optional", emoji: "✎", defaultRecipientGender: "m", defaultCover: "linen", defaultInterior: "classic" },
];

const text: Record<Locale, Record<ThemeId, ThemeText>> = {
  ru: {
    love: {
      name: "Любимому человеку",
      short: "Любимому",
      description: "История вашей любви: знакомство, первые свидания, мечты и слова, которые давно хотелось сказать.",
      recipientLabel: "Имя любимого человека",
      recipientPlaceholder: "Например, Алия",
      titleSuggestions: ["Наша история", "Ты — моё всё", "История нашей любви", "Мы"],
      chapters: loveChapters,
    },
    mom: {
      name: "Маме",
      short: "Маме",
      description: "Книга благодарности: детские воспоминания, уроки, которые мама преподала, и тёплые слова.",
      recipientLabel: "Как зовут маму",
      recipientPlaceholder: "Например, Гульнара",
      titleSuggestions: ["Мама, это для тебя", "Моя мама", "Спасибо, мама", "Всё начинается с тебя"],
      chapters: parentChapters,
    },
    dad: {
      name: "Папе",
      short: "Папе",
      description: "История, рассказанная ребёнком: детство рядом с папой, его советы, сила и забота.",
      recipientLabel: "Как зовут папу",
      recipientPlaceholder: "Например, Ерлан",
      titleSuggestions: ["Папа, это для тебя", "Мой папа", "Спасибо, папа", "Мой герой"],
      chapters: parentChapters,
    },
    parents: {
      name: "Родителям",
      short: "Родителям",
      description: "Книга для мамы и папы вместе: дом, в котором вы выросли, их история, уроки, семейные традиции и слова благодарности обоим.",
      recipientLabel: "Имена родителей",
      recipientPlaceholder: "Например, Гульнара и Ерлан",
      titleSuggestions: ["Маме и папе", "Спасибо, родители", "Дорогие родители", "Наша семья"],
      chapters: parentsChapters,
    },
    family: {
      name: "Семье",
      short: "Семье",
      description: "Книга для всей семьи: корни и род, дом и традиции, старшие и дети, праздники, испытания и то, что держит вас вместе.",
      recipientLabel: "Название семьи",
      recipientPlaceholder: "Например, семья Ахметовых",
      titleSuggestions: ["История нашей семьи", "Семейная книга", "Наш род", "Дом, где мы вместе"],
      chapters: familyChapters,
    },
    grandma: {
      name: "Бабушке",
      short: "Бабушке",
      description: "Книга от внуков: бабушкин дом и дастархан, сказки и забота, её жизнь, мудрость и слова благодарности.",
      recipientLabel: "Как зовут бабушку",
      recipientPlaceholder: "Например, Роза",
      titleSuggestions: ["Бабушка, это для тебя", "Моя бабушка", "Спасибо, бабушка", "Бабушкин дом"],
      chapters: grandmaChapters,
    },
    grandpa: {
      name: "Дедушке",
      short: "Дедушке",
      description: "Книга от внуков: дедушкин дом и мастерская, его дело и дороги, история любви к бабушке, мудрость и слова благодарности.",
      recipientLabel: "Как зовут дедушку",
      recipientPlaceholder: "Например, Кайрат",
      titleSuggestions: ["Дедушка, это для тебя", "Мой дедушка", "Спасибо, дедушка", "Дедушкин дом"],
      chapters: grandpaChapters,
    },
    child: {
      name: "Дочери или сыну",
      short: "Ребёнку",
      description: "Книга от мамы или папы: как вы ждали ребёнка, первые годы, истории взросления и то, что хочется передать на всю жизнь.",
      recipientLabel: "Как зовут дочь или сына",
      recipientPlaceholder: "Например, Амина",
      titleSuggestions: ["Тебе, мой ребёнок", "Ты — наше счастье", "История твоего детства", "Письма тебе"],
      chapters: childChapters,
    },
    sibling: {
      name: "Брату или сестре",
      short: "Брату/сестре",
      description: "Книга о том, как вы росли вместе: одна комната на двоих, ссоры и примирения, семейные истории и то, что связывает вас всю жизнь.",
      recipientLabel: "Как зовут брата или сестру",
      recipientPlaceholder: "Например, Айдана",
      titleSuggestions: ["Мы выросли вместе", "Ты и я", "Наше детство", "Родная душа"],
      chapters: siblingChapters,
    },
    friend: {
      name: "Другу или подруге",
      short: "Другу",
      description: "Книга о дружбе: безумные приключения, шутки для своих и благодарность за то, что вы рядом.",
      recipientLabel: "Имя друга или подруги",
      recipientPlaceholder: "Например, Дана",
      titleSuggestions: ["Книга о нашей дружбе", "Друзья навсегда", "Ты и я", "Просто мы"],
      chapters: friendChapters,
    },
    teacher: {
      name: "Учителю",
      short: "Учителю",
      description: "Книга благодарности учителю: первые уроки, школьные истории и слова, которые запомнились на всю жизнь. Можно написать от себя или всем классом.",
      recipientLabel: "Как зовут учителя",
      recipientPlaceholder: "Например, Сауле Кайратовна",
      titleSuggestions: ["Спасибо, учитель", "Уроки на всю жизнь", "Нашему учителю", "Вы научили нас главному"],
      chapters: teacherChapters,
    },
    autobiography: {
      name: "Автобиография",
      short: "Автобиография",
      description: "Книга о вашей жизни: корни, детство, любовь, работа, испытания и то, что хочется передать детям и внукам. Можно записать со слов близкого.",
      titleSuggestions: ["История моей жизни", "Моя жизнь", "Книга моей жизни", "Моим внукам"],
      chapters: autobiographyChapters,
    },
    blank: {
      name: "Своя книга",
      short: "Своя книга",
      description: "Книга с чистого листа: главы и разделы придумываете сами и пишете в своём порядке — без готовых вопросов.",
      recipientLabel: "Для кого — необязательно",
      recipientPlaceholder: "Например, детям",
      titleSuggestions: ["Моя книга", "Записки", "Истории", "Книга воспоминаний"],
      firstChapterTitle: "Начало",
      chapters: [],
    },
  },
  kk: {
    love: {
      name: "Сүйікті адамға",
      short: "Сүйіктіге",
      description: "Махаббатыңыздың тарихы: танысу, алғашқы кездесулер, армандар және көптен айтқыңыз келген сөздер.",
      recipientLabel: "Сүйікті адамның есімі",
      recipientPlaceholder: "Мысалы, Әлия",
      titleSuggestions: ["Біздің тарихымыз", "Сен — менің бәрімсің", "Махаббатымыздың тарихы", "Біз"],
      chapters: loveChaptersKk,
    },
    mom: {
      name: "Анаға",
      short: "Анаға",
      description: "Алғыс кітабы: балалық шақ естеліктері, анаңыз үйреткен сабақтар және жылы сөздер.",
      recipientLabel: "Анаңыздың есімі",
      recipientPlaceholder: "Мысалы, Гүлнар",
      titleSuggestions: ["Анашым, бұл саған", "Менің анам", "Рахмет, анашым", "Бәрі сенен басталады"],
      chapters: parentChaptersKk,
    },
    dad: {
      name: "Әкеге",
      short: "Әкеге",
      description: "Баланың айтқан тарихы: әкемен өткен балалық шақ, оның кеңестері, күші мен қамқорлығы.",
      recipientLabel: "Әкеңіздің есімі",
      recipientPlaceholder: "Мысалы, Ерлан",
      titleSuggestions: ["Әке, бұл саған", "Менің әкем", "Рахмет, әке", "Менің батырым"],
      chapters: parentChaptersKk,
    },
    parents: {
      name: "Ата-анаға",
      short: "Ата-анаға",
      description: "Ана мен әкеге бірге арналған кітап: сіз өскен үй, олардың тарихы, сабақтары, отбасылық дәстүрлері және екеуіне де алғыс.",
      recipientLabel: "Ата-анаңыздың есімдері",
      recipientPlaceholder: "Мысалы, Гүлнар және Ерлан",
      titleSuggestions: ["Анама және әкеме", "Ата-анам, рахмет", "Қымбатты ата-анам", "Біздің отбасымыз"],
      chapters: parentsChaptersKk,
    },
    family: {
      name: "Отбасыға",
      short: "Отбасыға",
      description: "Бүкіл отбасыға арналған кітап: түп-тамыр мен шежіре, үй мен дәстүр, үлкендер мен балалар, мерекелер, сынақтар және сізді біріктіретін нәрсе.",
      recipientLabel: "Отбасының атауы",
      recipientPlaceholder: "Мысалы, Ахметовтер отбасы",
      titleSuggestions: ["Біздің отбасымыздың тарихы", "Отбасылық кітап", "Біздің шежіре", "Бірге тұрған үйіміз"],
      chapters: familyChaptersKk,
    },
    grandma: {
      name: "Әжеге",
      short: "Әжеге",
      description: "Немерелерден кітап: әженің үйі мен дастарқаны, ертегілері мен қамқорлығы, оның өмірі, даналығы және алғыс сөздер.",
      recipientLabel: "Әжеңіздің есімі",
      recipientPlaceholder: "Мысалы, Роза",
      titleSuggestions: ["Әже, бұл саған", "Менің әжем", "Рахмет, әже", "Әженің үйі"],
      chapters: grandmaChaptersKk,
    },
    grandpa: {
      name: "Атаға",
      short: "Атаға",
      description: "Немерелерден кітап: атаның үйі мен шеберханасы, оның ісі мен жолдары, ата мен әженің махаббаты, оның даналығы және алғыс сөздер.",
      recipientLabel: "Атаңыздың есімі",
      recipientPlaceholder: "Мысалы, Қайрат",
      titleSuggestions: ["Ата, бұл саған", "Менің атам", "Рахмет, ата", "Атамның үйі"],
      chapters: grandpaChaptersKk,
    },
    child: {
      name: "Қызға немесе ұлға",
      short: "Балаға",
      description: "Анасынан не әкесінен кітап: баланы қалай күттіңіз, алғашқы жылдар, өсу оқиғалары және өмір бойы айтқыңыз келетін сөздер.",
      recipientLabel: "Қызыңыздың не ұлыңыздың есімі",
      recipientPlaceholder: "Мысалы, Әмина",
      titleSuggestions: ["Саған, балам", "Сен — біздің бақытымыз", "Балалық шағыңның тарихы", "Саған хаттар"],
      chapters: childChaptersKk,
    },
    sibling: {
      name: "Бауырға",
      short: "Бауырға",
      description: "Бірге қалай өскеніңіз туралы кітап: екеуге бір бөлме, ұрыс пен татуласу, отбасылық оқиғалар және өмір бойы байланыстырып тұрған нәрсе.",
      recipientLabel: "Бауырыңыздың есімі",
      recipientPlaceholder: "Мысалы, Айдана",
      titleSuggestions: ["Біз бірге өстік", "Сен және мен", "Біздің балалық шақ", "Туған жан"],
      chapters: siblingChaptersKk,
    },
    friend: {
      name: "Досқа немесе құрбыға",
      short: "Досқа",
      description: "Достық туралы кітап: есалаң оқиғалар, өзара әзілдер және қасымда жүргенің үшін алғыс.",
      recipientLabel: "Досыңыздың немесе құрбыңыздың есімі",
      recipientPlaceholder: "Мысалы, Дана",
      titleSuggestions: ["Достығымыз туралы кітап", "Мәңгілік достар", "Сен және мен", "Жай ғана біз"],
      chapters: friendChaptersKk,
    },
    teacher: {
      name: "Ұстазға",
      short: "Ұстазға",
      description: "Ұстазға алғыс кітабы: алғашқы сабақтар, мектеп оқиғалары және өмір бойы есте қалған сөздер. Өзіңізден не бүкіл сыныппен жазуға болады.",
      recipientLabel: "Ұстазыңыздың есімі",
      recipientPlaceholder: "Мысалы, Сәуле апай",
      titleSuggestions: ["Рахмет, ұстазым", "Өмірлік сабақтар", "Ұстазымызға", "Сіз бізге ең бастысын үйреттіңіз"],
      chapters: teacherChaptersKk,
    },
    autobiography: {
      name: "Өмірбаян",
      short: "Өмірбаян",
      description: "Өміріңіз туралы кітап: тегіңіз, балалық шақ, махаббат, еңбек, сынақтар және балалар мен немерелерге айтқыңыз келетін сөздер. Жақын адамның айтуымен де жазуға болады.",
      titleSuggestions: ["Менің өмірімнің тарихы", "Менің өмірім", "Өмірімнің кітабы", "Немерелеріме"],
      chapters: autobiographyChaptersKk,
    },
    blank: {
      name: "Өз кітабыңыз",
      short: "Өз кітабыңыз",
      description: "Таза парақтан басталатын кітап: тараулар мен бөлімдерді өзіңіз ойлап табасыз, дайын сұрақтарсыз, өз ретіңізбен жазасыз.",
      recipientLabel: "Кімге арналған — міндетті емес",
      recipientPlaceholder: "Мысалы, балаларыма",
      titleSuggestions: ["Менің кітабым", "Жазбалар", "Әңгімелер", "Естеліктер кітабы"],
      firstChapterTitle: "Бастау",
      chapters: [],
    },
  },
};

/** Глава для вопросов, у которых нет темы (пользовательские и из удалённых глав). */
const miscTitle: Record<Locale, string> = { ru: "Разное", kk: "Әртүрлі" };

const cache = new Map<string, ThemeDef>();

export const themeIds = base.map((b) => b.id);

/** Незнакомые темы, о которых уже предупредили в лог (по разу на тему). */
const warned = new Set<string>();

/**
 * Тема по id. Незнакомая тема (старые строки, откат релиза после появления новых видов) показывается как
 * «любимому» — только для показа: создать такую книгу нельзя (BooksService.start проверяет тему, unknownTheme).
 */
export function getTheme(id: string, lang: Locale = "ru"): ThemeDef {
  let b = base.find((t) => t.id === id);
  if (!b) {
    if (!warned.has(id)) {
      warned.add(id);
      console.warn(`[themes] неизвестная тема книги «${id}» — показываем как love`);
    }
    b = base[0];
  }
  const key = `${b.id}:${lang}`;
  let theme = cache.get(key);
  if (!theme) cache.set(key, (theme = { ...b, ...(text[lang] ?? text.ru)[b.id] }));
  return theme;
}

/** Все темы: мастер новой книги, фильтры и подписи CRM. */
export function getThemes(lang: Locale = "ru"): ThemeDef[] {
  return base.map((b) => getTheme(b.id, lang));
}

/** Темы-подарки: главная, /kniga, статьи — там, где книга дарится близкому и считаются вопросы о нём. */
export function giftThemes(lang: Locale = "ru"): (ThemeDef & { id: GiftThemeId })[] {
  return getThemes(lang).filter((t): t is ThemeDef & { id: GiftThemeId } => t.kind === "gift");
}

/** Темы с банком вопросов (подарки и автобиография): проверки банка, примеры вопросов. */
export function bankThemes(lang: Locale = "ru"): ThemeDef[] {
  return getThemes(lang).filter((t) => t.kind !== "blank");
}

export function isThemeId(id: string): id is ThemeId {
  return base.some((t) => t.id === id);
}

export function countQuestions(theme: ThemeDef) {
  return theme.chapters.reduce((sum, ch) => sum + ch.questions.length, 0);
}

export function chapterTitle(theme: ThemeDef, key: string, lang: Locale = "ru"): string {
  return theme.chapters.find((c) => c.key === key)?.title ?? miscTitle[lang];
}

/** Все тексты темы на обоих языках — для проверки полноты перевода в тестах. */
export function themeChaptersByLocale(id: ThemeId): Record<Locale, ChapterDef[]> {
  return { ru: text.ru[id].chapters, kk: text.kk[id].chapters };
}
