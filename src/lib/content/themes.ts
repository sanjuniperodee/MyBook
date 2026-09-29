import { friendChapters } from "./friend";
import { loveChapters } from "./love";
import { parentChapters } from "./parent";
import type { ThemeDef, ThemeId } from "./types";

export const themes: ThemeDef[] = [
  {
    id: "love",
    name: "Любимому человеку",
    short: "Любимому",
    description: "История вашей любви: знакомство, первые свидания, мечты и слова, которые давно хотелось сказать.",
    emoji: "❤",
    recipientLabel: "Имя любимого человека",
    recipientPlaceholder: "Например, Алия",
    defaultRecipientGender: "m",
    titleSuggestions: ["Наша история", "Ты — моё всё", "История нашей любви", "Мы"],
    defaultCover: "blossom",
    chapters: loveChapters,
  },
  {
    id: "mom",
    name: "Маме",
    short: "Маме",
    description: "Книга благодарности: детские воспоминания, уроки, которые мама преподала, и тёплые слова.",
    emoji: "✿",
    recipientLabel: "Как зовут маму",
    recipientPlaceholder: "Например, Гульнара",
    recipientGender: "f",
    defaultRecipientGender: "f",
    titleSuggestions: ["Мама, это для тебя", "Моя мама", "Спасибо, мама", "Всё начинается с тебя"],
    defaultCover: "sage",
    chapters: parentChapters,
  },
  {
    id: "dad",
    name: "Папе",
    short: "Папе",
    description: "История, рассказанная ребёнком: детство рядом с папой, его советы, сила и забота.",
    emoji: "✦",
    recipientLabel: "Как зовут папу",
    recipientPlaceholder: "Например, Ерлан",
    recipientGender: "m",
    defaultRecipientGender: "m",
    titleSuggestions: ["Папа, это для тебя", "Мой папа", "Спасибо, папа", "Мой герой"],
    defaultCover: "midnight",
    chapters: parentChapters,
  },
  {
    id: "friend",
    name: "Другу или подруге",
    short: "Другу",
    description: "Книга о дружбе: безумные приключения, шутки для своих и благодарность за то, что вы рядом.",
    emoji: "☀",
    recipientLabel: "Имя друга или подруги",
    recipientPlaceholder: "Например, Дана",
    defaultRecipientGender: "f",
    titleSuggestions: ["Книга о нашей дружбе", "Друзья навсегда", "Ты и я", "Просто мы"],
    defaultCover: "terracotta",
    chapters: friendChapters,
  },
];

export function getTheme(id: string): ThemeDef {
  return themes.find((t) => t.id === id) ?? themes[0];
}

export function isThemeId(id: string): id is ThemeId {
  return themes.some((t) => t.id === id);
}

export function countQuestions(theme: ThemeDef) {
  return theme.chapters.reduce((sum, ch) => sum + ch.questions.length, 0);
}

export function chapterTitle(theme: ThemeDef, key: string): string {
  return theme.chapters.find((c) => c.key === key)?.title ?? "Разное";
}

export const CUSTOM_CHAPTER = "custom";
