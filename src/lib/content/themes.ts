import type { Locale } from "@/i18n/config";
import { autobiographyChapters } from "./autobiography";
import { childChapters } from "./child";
import { daughterinlawChapters } from "./daughterinlaw";
import { familyChapters } from "./family";
import { friendChapters } from "./friend";
import { grandmaChapters } from "./grandma";
import { grandpaChapters } from "./grandpa";
import { loveChapters } from "./love";
import { parentChapters } from "./parent";
import { parentsChapters } from "./parents";
import { siblingChapters } from "./sibling";
import { teacherChapters } from "./teacher";
import { colleagueChapters } from "./colleague";
import { bossChapters } from "./boss";
import { autobiographyChapters as autobiographyChaptersKk } from "./kk/autobiography";
import { childChapters as childChaptersKk } from "./kk/child";
import { daughterinlawChapters as daughterinlawChaptersKk } from "./kk/daughterinlaw";
import { familyChapters as familyChaptersKk } from "./kk/family";
import { friendChapters as friendChaptersKk } from "./kk/friend";
import { grandmaChapters as grandmaChaptersKk } from "./kk/grandma";
import { grandpaChapters as grandpaChaptersKk } from "./kk/grandpa";
import { loveChapters as loveChaptersKk } from "./kk/love";
import { parentChapters as parentChaptersKk } from "./kk/parent";
import { parentsChapters as parentsChaptersKk } from "./kk/parents";
import { siblingChapters as siblingChaptersKk } from "./kk/sibling";
import { teacherChapters as teacherChaptersKk } from "./kk/teacher";
import { autobiographyChapters as autobiographyChaptersUz } from "./uz/autobiography";
import { childChapters as childChaptersUz } from "./uz/child";
import { daughterinlawChapters as daughterinlawChaptersUz } from "./uz/daughterinlaw";
import { familyChapters as familyChaptersUz } from "./uz/family";
import { friendChapters as friendChaptersUz } from "./uz/friend";
import { grandmaChapters as grandmaChaptersUz } from "./uz/grandma";
import { grandpaChapters as grandpaChaptersUz } from "./uz/grandpa";
import { loveChapters as loveChaptersUz } from "./uz/love";
import { parentChapters as parentChaptersUz } from "./uz/parent";
import { parentsChapters as parentsChaptersUz } from "./uz/parents";
import { siblingChapters as siblingChaptersUz } from "./uz/sibling";
import { teacherChapters as teacherChaptersUz } from "./uz/teacher";
import { colleagueChapters as colleagueChaptersUz } from "./uz/colleague";
import { bossChapters as bossChaptersUz } from "./uz/boss";
import { colleagueChapters as colleagueChaptersKk } from "./kk/colleague";
import { bossChapters as bossChaptersKk } from "./kk/boss";
import { autobiographyChapters as autobiographyChaptersEn } from "./en/autobiography";
import { childChapters as childChaptersEn } from "./en/child";
import { daughterinlawChapters as daughterinlawChaptersEn } from "./en/daughterinlaw";
import { familyChapters as familyChaptersEn } from "./en/family";
import { friendChapters as friendChaptersEn } from "./en/friend";
import { grandmaChapters as grandmaChaptersEn } from "./en/grandma";
import { grandpaChapters as grandpaChaptersEn } from "./en/grandpa";
import { loveChapters as loveChaptersEn } from "./en/love";
import { parentChapters as parentChaptersEn } from "./en/parent";
import { parentsChapters as parentsChaptersEn } from "./en/parents";
import { siblingChapters as siblingChaptersEn } from "./en/sibling";
import { teacherChapters as teacherChaptersEn } from "./en/teacher";
import { colleagueChapters as colleagueChaptersEn } from "./en/colleague";
import { bossChapters as bossChaptersEn } from "./en/boss";
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
  // Снохе — от свекрови, свёкра или мужа; адресат женского рода.
  { id: "daughterinlaw", kind: "gift", recipient: "required", emoji: "❦", recipientGender: "f", defaultRecipientGender: "f", defaultCover: "postcards", defaultInterior: "vintage" },
  // Дочери или сыну: род ребёнка выбирают в мастере.
  { id: "child", kind: "gift", recipient: "required", emoji: "❀", defaultRecipientGender: "f", defaultCover: "clouds", defaultInterior: "watercolor" },
  { id: "sibling", kind: "gift", recipient: "required", emoji: "✧", defaultRecipientGender: "f", defaultCover: "lemons", defaultInterior: "album" },
  { id: "friend", kind: "gift", recipient: "required", emoji: "☀", defaultRecipientGender: "f", defaultCover: "party", defaultInterior: "confetti" },
  // Учителю: чаще дарят учительнице; осенняя обложка — к Дню учителя.
  { id: "teacher", kind: "gift", recipient: "required", emoji: "✐", defaultRecipientGender: "f", defaultCover: "autumn", defaultInterior: "editorial" },
  // Коллеге и руководителю: род адресата выбирают в мастере (как у учителя).
  { id: "colleague", kind: "gift", recipient: "required", emoji: "☕", defaultRecipientGender: "f", defaultCover: "mist", defaultInterior: "airy" },
  { id: "boss", kind: "gift", recipient: "required", emoji: "✦", defaultRecipientGender: "m", defaultCover: "midnight", defaultInterior: "luxe" },
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
    daughterinlaw: {
      name: "Снохе",
      short: "Снохе",
      description: "Книга от свекрови, свёкра или мужа: как она вошла в семью, первые впечатления, её черты и заслуги, семейные традиции, благодарность и пожелания.",
      recipientLabel: "Как зовут сноху",
      recipientPlaceholder: "Например, Айгерим",
      titleSuggestions: ["Тебе, наша сноха", "Добро пожаловать в семью", "Спасибо, что ты с нами", "Наша Айгерим"],
      chapters: daughterinlawChapters,
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
    colleague: {
      name: "Коллеге",
      short: "Коллеге",
      description: "Книга от команды или от коллеги: как вы познакомились, рабочие будни и общие победы, истории и шутки отдела, трудные дни и слова благодарности.",
      recipientLabel: "Как зовут коллегу",
      recipientPlaceholder: "Например, Динара",
      titleSuggestions: ["Лучшему коллеге", "Спасибо, что ты в нашей команде", "Наш человек в отделе", "С тобой работать — одно удовольствие"],
      chapters: colleagueChapters,
    },
    boss: {
      name: "Руководителю",
      short: "Руководителю",
      description: "Книга от команды или сотрудника руководителю и директору: как вы начали работать вместе, как он руководит, чему научил, трудные и важные дни и слова благодарности.",
      recipientLabel: "Как зовут руководителя",
      recipientPlaceholder: "Например, Ерлан Маратович",
      titleSuggestions: ["Спасибо, руководитель", "Нашему директору", "С Вами — команда", "Вы научили нас главному"],
      chapters: bossChapters,
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
    daughterinlaw: {
      name: "Келінге",
      short: "Келінге",
      description: "Енесінен, қайын атасынан немесе жолдасынан келінге арналған кітап: отбасына қалай келгені, алғашқы әсер, қасиеттері мен еңбегі, отбасы дәстүрлері, алғыс пен тілектер.",
      recipientLabel: "Келіннің аты",
      recipientPlaceholder: "Мысалы, Айгерім",
      titleSuggestions: ["Саған, біздің келін", "Отбасыға қош келдің", "Бізбен болғаныңа рахмет", "Біздің Айгерім"],
      chapters: daughterinlawChaptersKk,
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
    colleague: {
      name: "Әріптеске",
      short: "Әріптеске",
      description: "Ұжымнан не әріптестен кітап: қалай танысқандарыңыз, жұмыс күндері мен ортақ жеңістер, бөлімнің оқиғалары мен әзілдері, қиын күндер және алғыс сөздер.",
      recipientLabel: "Әріптестің есімі",
      recipientPlaceholder: "Мысалы, Динара",
      titleSuggestions: ["Ең жақсы әріптеске", "Ұжымымызда болғаныңа рахмет", "Біздің бөлімнің адамы", "Сенімен жұмыс істеу — ләззат"],
      chapters: colleagueChaptersKk,
    },
    boss: {
      name: "Басшыға",
      short: "Басшыға",
      description: "Ұжымнан не қызметкерден басшыға және директорға кітап: қалай бірге жұмыс істей бастағандарыңыз, ол қалай басқарады, не үйретті, қиын және маңызды күндер және алғыс сөздер.",
      recipientLabel: "Басшының есімі",
      recipientPlaceholder: "Мысалы, Ермек Маратұлы",
      titleSuggestions: ["Рахмет, басшымыз", "Директорымызға", "Сізбен — ұжым", "Сіз бізге ең бастысын үйреттіңіз"],
      chapters: bossChaptersKk,
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
  // Узбекский (латиница): банк вопросов и подписи книги. Апостроф в o‘, g‘ — U+2018, тутук — U+2019 (в шрифтах сайта и PDF они есть).
  uz: {
    love: {
      name: "Sevgan insonga",
      short: "Sevganga",
      description: "Sevgingiz tarixi: tanishuv, birinchi uchrashuvlar, orzular va uzoq vaqtdan beri aytmoqchi bo‘lgan so‘zlaringiz.",
      recipientLabel: "Sevgan insonning ismi",
      recipientPlaceholder: "Masalan, Aliya",
      titleSuggestions: ["Bizning tariximiz", "Sen — mening hamma narsamsan", "Sevgimiz tarixi", "Biz"],
      chapters: loveChaptersUz,
    },
    mom: {
      name: "Onaga",
      short: "Onaga",
      description: "Minnatdorchilik kitobi: bolalik xotiralari, ona bergan saboqlar va iliq so‘zlar.",
      recipientLabel: "Onaning ismi",
      recipientPlaceholder: "Masalan, Gulnora",
      titleSuggestions: ["Ona, bu sizga", "Mening onam", "Rahmat, ona", "Hammasi sizdan boshlanadi"],
      chapters: parentChaptersUz,
    },
    dad: {
      name: "Otaga",
      short: "Otaga",
      description: "Farzand tilidan hikoya: ota yonidagi bolalik, uning maslahatlari, kuchi va g‘amxo‘rligi.",
      recipientLabel: "Otaning ismi",
      recipientPlaceholder: "Masalan, Erlan",
      titleSuggestions: ["Ota, bu sizga", "Mening otam", "Rahmat, ota", "Mening qahramonim"],
      chapters: parentChaptersUz,
    },
    parents: {
      name: "Ota-onaga",
      short: "Ota-onaga",
      description: "Ona va otaga birgalikda kitob: siz ulg‘aygan uy, ularning tarixi, saboqlar, oilaviy an’analar va ikkalasiga minnatdorchilik so‘zlari.",
      recipientLabel: "Ota-onaning ismlari",
      recipientPlaceholder: "Masalan, Gulnora va Erlan",
      titleSuggestions: ["Ona va otamga", "Rahmat, ota-ona", "Aziz ota-onam", "Bizning oilamiz"],
      chapters: parentsChaptersUz,
    },
    family: {
      name: "Oilaga",
      short: "Oilaga",
      description: "Butun oila uchun kitob: ildizlar va nasl-nasab, uy va an’analar, kattalar va bolalar, bayramlar, sinovlar va sizni birga ushlab turgan narsa.",
      recipientLabel: "Oilaning nomi",
      recipientPlaceholder: "Masalan, Ahmetovlar oilasi",
      titleSuggestions: ["Oilamiz tarixi", "Oilaviy kitob", "Bizning nasl-nasab", "Birga bo‘lgan uyimiz"],
      chapters: familyChaptersUz,
    },
    grandma: {
      name: "Buviga",
      short: "Buviga",
      description: "Nevaralar tilidan kitob: buvining uyi va dasturxoni, ertaklar va g‘amxo‘rlik, uning hayoti, donoligi va minnatdorchilik so‘zlari.",
      recipientLabel: "Buvining ismi",
      recipientPlaceholder: "Masalan, Roza",
      titleSuggestions: ["Buvijon, bu sizga", "Mening buvim", "Rahmat, buvijon", "Buvimning uyi"],
      chapters: grandmaChaptersUz,
    },
    grandpa: {
      name: "Boboga",
      short: "Boboga",
      description: "Nevaralar tilidan kitob: bobo uyi va ustaxonasi, uning ishi va yo‘llari, buviga muhabbat tarixi, donolik va minnatdorchilik so‘zlari.",
      recipientLabel: "Boboning ismi",
      recipientPlaceholder: "Masalan, Qayrat",
      titleSuggestions: ["Bobojon, bu sizga", "Mening bobom", "Rahmat, bobojon", "Bobomning uyi"],
      chapters: grandpaChaptersUz,
    },
    daughterinlaw: {
      name: "Kelinga",
      short: "Kelinga",
      description: "Qaynona, qaynota yoki er tomonidan kitob: u oilaga qanday kirib kelgani, birinchi taassurotlar, fazilatlari va xizmatlari, oilaviy an’analar, minnatdorchilik va tilaklar.",
      recipientLabel: "Kelinning ismi",
      recipientPlaceholder: "Masalan, Aygerim",
      titleSuggestions: ["Sizga, aziz kelinimiz", "Oilamizga xush kelibsiz", "Biz bilan bo‘lganingiz uchun rahmat", "Bizning Aygerim"],
      chapters: daughterinlawChaptersUz,
    },
    child: {
      name: "Qiz yoki o‘g‘ilga",
      short: "Farzandga",
      description: "Ona yoki ota tilidan kitob: farzandni qanday kutganingiz, dastlabki yillar, ulg‘ayish hikoyalari va butun umrga qoldirmoqchi bo‘lgan narsalar.",
      recipientLabel: "Qiz yoki o‘g‘ilning ismi",
      recipientPlaceholder: "Masalan, Amina",
      titleSuggestions: ["Senga, farzandim", "Sen — bizning baxtimizsan", "Bolaligingning tarixi", "Senga xatlar"],
      chapters: childChaptersUz,
    },
    sibling: {
      name: "Aka-ukaga yoki opa-singilga",
      short: "Aka-ukaga/opa-singilga",
      description: "Birga ulg‘ayganingiz haqida kitob: ikkovingizga bitta xona, janjal va yarashuvlar, oilaviy hikoyalar va sizni umr bo‘yi bog‘lab turgan narsa.",
      recipientLabel: "Aka-uka yoki opa-singilning ismi",
      recipientPlaceholder: "Masalan, Aydana",
      titleSuggestions: ["Biz birga ulg‘aydik", "Sen va men", "Bizning bolaligimiz", "Qadrdon jon"],
      chapters: siblingChaptersUz,
    },
    friend: {
      name: "Do‘stga",
      short: "Do‘stga",
      description: "Do‘stlik haqida kitob: telba sarguzashtlar, o‘zimizbop hazillar va yoningizda bo‘lgani uchun minnatdorchilik.",
      recipientLabel: "Do‘stning ismi",
      recipientPlaceholder: "Masalan, Dana",
      titleSuggestions: ["Do‘stligimiz kitobi", "Do‘stlar abadiy", "Sen va men", "Oddiygina biz"],
      chapters: friendChaptersUz,
    },
    teacher: {
      name: "Ustozga",
      short: "Ustozga",
      description: "Ustozga minnatdorchilik kitobi: birinchi darslar, maktab hikoyalari va umrbod yodda qolgan so‘zlar. O‘zingiz nomingizdan yoki butun sinf bilan yozish mumkin.",
      recipientLabel: "Ustozning ismi",
      recipientPlaceholder: "Masalan, Saule Qayratovna",
      titleSuggestions: ["Rahmat, ustoz", "Umrga yetadigan darslar", "Ustozimizga", "Siz bizga eng muhimini o‘rgatdingiz"],
      chapters: teacherChaptersUz,
    },
    colleague: {
      name: "Hamkasbga",
      short: "Hamkasbga",
      description: "Jamoadan yoki hamkasbdan kitob: qanday tanishganingiz, ish kunlari va umumiy g‘alabalar, bo‘lim hikoyalari va hazillari, og‘ir kunlar va minnatdorchilik so‘zlari.",
      recipientLabel: "Hamkasbning ismi",
      recipientPlaceholder: "Masalan, Dinara",
      titleSuggestions: ["Eng yaxshi hamkasbimizga", "Jamoamizda bo‘lganing uchun rahmat", "Bo‘limimizning odami", "Sen bilan ishlash — katta zavq"],
      chapters: colleagueChaptersUz,
    },
    boss: {
      name: "Rahbarga",
      short: "Rahbarga",
      description: "Jamoadan yoki xodimdan rahbar va direktorga kitob: birga ishlay boshlaganingiz, u qanday boshqarishi, nimani o‘rgatgani, og‘ir va muhim kunlar hamda minnatdorchilik so‘zlari.",
      recipientLabel: "Rahbarning ismi",
      recipientPlaceholder: "Masalan, Yerlan Maratovich",
      titleSuggestions: ["Rahmat, rahbarimiz", "Direktorimizga", "Siz bilan — jamoa", "Siz bizga eng muhimini o‘rgatdingiz"],
      chapters: bossChaptersUz,
    },
    autobiography: {
      name: "Tarjimai hol",
      short: "Tarjimai hol",
      description: "Hayotingiz haqida kitob: ildizlar, bolalik, sevgi, mehnat, sinovlar va bolalaringiz hamda nevaralaringizga qoldirmoqchi bo‘lgan narsalar. Yaqin odamning og‘zidan yozib olish ham mumkin.",
      titleSuggestions: ["Hayotim tarixi", "Mening hayotim", "Hayotim kitobi", "Nevaralarimga"],
      chapters: autobiographyChaptersUz,
    },
    blank: {
      name: "O‘z kitobingiz",
      short: "O‘z kitobingiz",
      description: "Oq varaqdan boshlanadigan kitob: bob va bo‘limlarni o‘zingiz o‘ylab topasiz va o‘z tartibingizda yozasiz — tayyor savollarsiz.",
      recipientLabel: "Kim uchun — majburiy emas",
      recipientPlaceholder: "Masalan, bolalarimga",
      titleSuggestions: ["Mening kitobim", "Yozuvlar", "Hikoyalar", "Xotiralar kitobi"],
      firstChapterTitle: "Boshlanish",
      chapters: [],
    },
  },
  // English: question banks and book labels. Recipient/author gender markers follow the Russian banks ([him|her], [he|she]).
  en: {
    love: { name: "To my loved one", short: "Loved one", description: "The story of your love: how you met, first dates, dreams and the words you have wanted to say for a long time.", recipientLabel: "Your loved one’s name", recipientPlaceholder: "For example, Alia", titleSuggestions: ["Our Story", "You Are My Everything", "The Story of Our Love", "Us"], chapters: loveChaptersEn },
    mom: { name: "To Mom", short: "Mom", description: "A book of gratitude: childhood memories, the lessons Mom taught and warm words.", recipientLabel: "Mom’s name", recipientPlaceholder: "For example, Gulnara", titleSuggestions: ["Mom, This Is for You", "My Mom", "Thank You, Mom", "It All Starts with You"], chapters: parentChaptersEn },
    dad: { name: "To Dad", short: "Dad", description: "A story told by a child: childhood next to Dad, his advice, strength and care.", recipientLabel: "Dad’s name", recipientPlaceholder: "For example, Yerlan", titleSuggestions: ["Dad, This Is for You", "My Dad", "Thank You, Dad", "My Hero"], chapters: parentChaptersEn },
    parents: { name: "To my parents", short: "Parents", description: "A book for Mom and Dad together: the home you grew up in, their story, lessons, family traditions and words of thanks to both.", recipientLabel: "Parents’ names", recipientPlaceholder: "For example, Gulnara and Yerlan", titleSuggestions: ["To Mom and Dad", "Thank You, Parents", "Dear Parents", "Our Family"], chapters: parentsChaptersEn },
    family: { name: "To the family", short: "Family", description: "A book for the whole family: roots and ancestry, home and traditions, elders and children, holidays, hard times and what keeps you together.", recipientLabel: "Family name", recipientPlaceholder: "For example, the Akhmetov family", titleSuggestions: ["Our Family Story", "The Family Book", "Our Roots", "The Home Where We Are Together"], chapters: familyChaptersEn },
    grandma: { name: "To Grandma", short: "Grandma", description: "A book from her grandchildren: Grandma’s home and table, fairy tales and care, her life, wisdom and words of thanks.", recipientLabel: "Grandma’s name", recipientPlaceholder: "For example, Rosa", titleSuggestions: ["Grandma, This Is for You", "My Grandma", "Thank You, Grandma", "Grandma’s House"], chapters: grandmaChaptersEn },
    grandpa: { name: "To Grandpa", short: "Grandpa", description: "A book from his grandchildren: Grandpa’s home and workshop, his work and roads, the love story with Grandma, wisdom and words of thanks.", recipientLabel: "Grandpa’s name", recipientPlaceholder: "For example, Kairat", titleSuggestions: ["Grandpa, This Is for You", "My Grandpa", "Thank You, Grandpa", "Grandpa’s House"], chapters: grandpaChaptersEn },
    daughterinlaw: { name: "To my daughter-in-law", short: "Daughter-in-law", description: "A book from a mother-in-law, father-in-law or husband: how she joined the family, first impressions, her qualities and merits, family traditions, gratitude and wishes.", recipientLabel: "Her name", recipientPlaceholder: "For example, Aigerim", titleSuggestions: ["To You, Our Daughter-in-Law", "Welcome to the Family", "Thank You for Being with Us", "Our Aigerim"], chapters: daughterinlawChaptersEn },
    child: { name: "To a daughter or son", short: "Child", description: "A book from Mom or Dad: how you waited for your child, the first years, growing-up stories and what you want to pass on for life.", recipientLabel: "Your daughter’s or son’s name", recipientPlaceholder: "For example, Amina", titleSuggestions: ["To You, My Child", "You Are Our Happiness", "The Story of Your Childhood", "Letters to You"], chapters: childChaptersEn },
    sibling: { name: "To a brother or sister", short: "Brother/sister", description: "A book about growing up together: one room for two, quarrels and making up, family stories and what binds you for life.", recipientLabel: "Brother’s or sister’s name", recipientPlaceholder: "For example, Aidana", titleSuggestions: ["We Grew Up Together", "You and Me", "Our Childhood", "A Kindred Spirit"], chapters: siblingChaptersEn },
    friend: { name: "To a friend", short: "Friend", description: "A book about friendship: wild adventures, inside jokes and thanks for being there.", recipientLabel: "Your friend’s name", recipientPlaceholder: "For example, Dana", titleSuggestions: ["The Book of Our Friendship", "Friends Forever", "You and Me", "Just Us"], chapters: friendChaptersEn },
    teacher: { name: "To a teacher", short: "Teacher", description: "A book of gratitude to a teacher: first lessons, school stories and words remembered for life. Write for yourself or with the whole class.", recipientLabel: "Teacher’s name", recipientPlaceholder: "For example, Saule Kairatovna", titleSuggestions: ["Thank You, Teacher", "Lessons for a Lifetime", "To Our Teacher", "You Taught Us What Matters Most"], chapters: teacherChaptersEn },
    colleague: { name: "To a colleague", short: "Colleague", description: "A book from the team or a colleague: how you met, workdays and shared wins, the department’s stories and jokes, hard days and words of thanks.", recipientLabel: "Colleague’s name", recipientPlaceholder: "For example, Dinara", titleSuggestions: ["To the Best Colleague", "Thank You for Being on Our Team", "Our Person in the Office", "Working with You Is a Pleasure"], chapters: colleagueChaptersEn },
    boss: { name: "To a boss", short: "Boss", description: "A book from the team or an employee to a manager or director: how you started working together, how they lead, what they taught, hard and important days and words of thanks.", recipientLabel: "Manager’s name", recipientPlaceholder: "For example, Yerlan Maratovich", titleSuggestions: ["Thank You, Boss", "To Our Director", "A Team with You", "You Taught Us What Matters Most"], chapters: bossChaptersEn },
    autobiography: { name: "Autobiography", short: "Autobiography", description: "A book about your life: roots, childhood, love, work, hard times and what you want to pass on to your children and grandchildren. It can be written down from a loved one’s words.", titleSuggestions: ["The Story of My Life", "My Life", "The Book of My Life", "For My Grandchildren"], chapters: autobiographyChaptersEn },
    blank: { name: "Your own book", short: "Your own book", description: "A book from a blank page: you invent the chapters and sections and write in your own order — no ready-made questions.", recipientLabel: "For whom — optional", recipientPlaceholder: "For example, my children", titleSuggestions: ["My Book", "Notes", "Stories", "A Book of Memories"], firstChapterTitle: "The Beginning", chapters: [] },
  },
};

/** Глава для вопросов, у которых нет темы (пользовательские и из удалённых глав). */
const miscTitle: Record<Locale, string> = { ru: "Разное", kk: "Әртүрлі", uz: "Turli", en: "Miscellaneous" };

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
  return { ru: text.ru[id].chapters, kk: text.kk[id].chapters, uz: text.uz[id].chapters, en: text.en[id].chapters };
}
