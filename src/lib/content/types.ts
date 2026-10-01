import type { Gender } from "@/shared/infrastructure/db/schema";

/** [вопрос автору, заголовок в книге, подсказка?] */
export type QuestionTuple = [prompt: string, title: string, hint?: string];

export interface ChapterDef {
  key: string;
  title: string;
  epigraph?: string;
  questions: QuestionTuple[];
}

export type ThemeId = "love" | "mom" | "dad" | "friend";

export interface ThemeDef {
  id: ThemeId;
  name: string;
  short: string;
  description: string;
  emoji: string;
  recipientLabel: string;
  recipientPlaceholder: string;
  /** Если задан — род адресата фиксирован (мама/папа). */
  recipientGender?: Gender;
  defaultRecipientGender: Gender;
  titleSuggestions: string[];
  defaultCover: string;
  chapters: ChapterDef[];
}
