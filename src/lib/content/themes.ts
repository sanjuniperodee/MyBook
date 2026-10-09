import type { Locale } from "@/i18n/config";
import { friendChapters } from "./friend";
import { loveChapters } from "./love";
import { parentChapters } from "./parent";
import { friendChapters as friendChaptersKk } from "./kk/friend";
import { loveChapters as loveChaptersKk } from "./kk/love";
import { parentChapters as parentChaptersKk } from "./kk/parent";
import type { ChapterDef, ThemeDef, ThemeId } from "./types";

/**
 * Темы книг. Оформление (обложка, род адресата) общее, тексты — на языке книги.
 * Язык книги выбирается при создании и хранится в books.language: вопросы копируются в книгу
 * на этом языке, на нём же печатаются заголовки глав. Язык интерфейса на это не влияет.
 */

type ThemeBase = Pick<ThemeDef, "id" | "emoji" | "recipientGender" | "defaultRecipientGender" | "defaultCover" | "defaultInterior">;
type ThemeText = Omit<ThemeDef, keyof ThemeBase>;

const base: ThemeBase[] = [
  { id: "love", emoji: "❤", defaultRecipientGender: "m", defaultCover: "peony", defaultInterior: "romance" },
  { id: "mom", emoji: "✿", recipientGender: "f", defaultRecipientGender: "f", defaultCover: "tenderness", defaultInterior: "herbarium" },
  { id: "dad", emoji: "✦", recipientGender: "m", defaultRecipientGender: "m", defaultCover: "alatau", defaultInterior: "stars" },
  { id: "friend", emoji: "☀", defaultRecipientGender: "f", defaultCover: "party", defaultInterior: "confetti" },
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
    friend: {
      name: "Другу или подруге",
      short: "Другу",
      description: "Книга о дружбе: безумные приключения, шутки для своих и благодарность за то, что вы рядом.",
      recipientLabel: "Имя друга или подруги",
      recipientPlaceholder: "Например, Дана",
      titleSuggestions: ["Книга о нашей дружбе", "Друзья навсегда", "Ты и я", "Просто мы"],
      chapters: friendChapters,
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
    friend: {
      name: "Досқа немесе құрбыға",
      short: "Досқа",
      description: "Достық туралы кітап: есалаң оқиғалар, өзара әзілдер және қасымда жүргенің үшін алғыс.",
      recipientLabel: "Досыңыздың немесе құрбыңыздың есімі",
      recipientPlaceholder: "Мысалы, Дана",
      titleSuggestions: ["Достығымыз туралы кітап", "Мәңгілік достар", "Сен және мен", "Жай ғана біз"],
      chapters: friendChaptersKk,
    },
  },
};

/** Глава для вопросов, у которых нет темы (пользовательские и из удалённых глав). */
const miscTitle: Record<Locale, string> = { ru: "Разное", kk: "Әртүрлі" };

const cache = new Map<string, ThemeDef>();

export const themeIds = base.map((b) => b.id);

export function getTheme(id: string, lang: Locale = "ru"): ThemeDef {
  const b = base.find((t) => t.id === id) ?? base[0];
  const key = `${b.id}:${lang}`;
  let theme = cache.get(key);
  if (!theme) cache.set(key, (theme = { ...b, ...(text[lang] ?? text.ru)[b.id] }));
  return theme;
}

export function getThemes(lang: Locale = "ru"): ThemeDef[] {
  return base.map((b) => getTheme(b.id, lang));
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

export const CUSTOM_CHAPTER = "custom";
