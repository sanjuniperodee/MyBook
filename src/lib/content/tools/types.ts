import type { Locale } from "@/i18n/config";
import type { ThemeId } from "../types";
import type { QuizId } from "@/lib/tools/quiz";

export type ToolKind = "together" | "deadline" | "price" | "greeting" | "cards" | "quiz" | "photo" | "pages" | "planner" | "shezhire";

export interface ToolSection {
  heading: string;
  paragraphs: string[];
  list?: string[];
}

export interface ToolContent {
  /** Короткое имя: хлебные крошки, карточки, ссылки. */
  label: string;
  h1: string;
  accent: string;
  metaTitle: string;
  metaDescription: string;
  lead: string;
  /** Короткая подпись на карточке в списке инструментов. */
  teaser: string;
  sections: ToolSection[];
  faq: [string, string][];
  cta: { title: string; text: string };
}

export interface ToolDef {
  slug: string;
  kind: ToolKind;
  /** Для тестов: какой именно тест. */
  quiz?: QuizId;
  /** Тема книги для кнопки «создать» и посадочная страница, на которую ведёт инструмент. */
  theme: ThemeId;
  landing?: string;
  content: Record<Locale, ToolContent>;
}
