import type { Locale } from "@/i18n/config";
import type { ThemeId } from "../types";

export interface ArticleSection {
  heading: string;
  paragraphs?: string[];
  list?: string[];
}

export interface ArticleContent {
  title: string;
  description: string;
  lead: string;
  sections: ArticleSection[];
  /** Заголовок и вступление блока вопросов из банка темы (только для подборок вопросов). */
  questions?: { heading: string; intro: string };
  faq: [string, string][];
  cta: { title: string; text: string };
}

export interface Article {
  slug: string;
  /** Даты в формате YYYY-MM-DD. */
  published: string;
  updated?: string;
  readMinutes: number;
  /** Тема книги для кнопки «начать» и для вопросов. */
  theme: ThemeId;
  /** Подборка вопросов из банка темы: после скольких разделов вставить и сколько вопросов брать из главы. */
  bank?: { afterSection: number; perChapter: number; skip: string[]; author: "m" | "f"; recipient: "m" | "f" };
  /** Посадочные страницы /kniga/<slug>, на которые ведёт статья. */
  landings: string[];
  content: Record<Locale, ArticleContent>;
}
