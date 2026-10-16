import type { Gender } from "@/shared/infrastructure/db/schema";
import type { BookKind, RecipientPolicy } from "./kinds";

/** [вопрос автору, заголовок в книге, подсказка?] */
export type QuestionTuple = [prompt: string, title: string, hint?: string];

export interface ChapterDef {
  key: string;
  title: string;
  epigraph?: string;
  questions: QuestionTuple[];
}

/** Темы-подарки (банк вопросов о близком человеке). */
export type GiftThemeId = "love" | "mom" | "dad" | "friend";
/** Все темы: подарки, автобиография (банк вопросов о жизни рассказчика) и своя книга с чистого листа (без банка). */
export type ThemeId = GiftThemeId | "autobiography" | "blank";

export interface ThemeDef {
  id: ThemeId;
  /** Вид книги (lib/content/kinds): подарок, автобиография или своя книга. */
  kind: BookKind;
  /** Нужен ли получатель: обязателен, по желанию или его нет (автобиография). */
  recipient: RecipientPolicy;
  name: string;
  short: string;
  description: string;
  emoji: string;
  /** Подпись и пример поля получателя; у автобиографии получателя нет. */
  recipientLabel?: string;
  recipientPlaceholder?: string;
  /** Если задан — род адресата фиксирован (мама/папа). */
  recipientGender?: Gender;
  defaultRecipientGender: Gender;
  /** Варианты названия: ru и kk одной длины — смена языка сопоставляет их по индексу. */
  titleSuggestions: string[];
  /** Название первой главы новой книги, если автор не ввёл своё (только своя книга). */
  firstChapterTitle?: string;
  defaultCover: string;
  /** Оформление страниц новой книги — в пару к обложке темы (id из lib/book/interiors). */
  defaultInterior: string;
  chapters: ChapterDef[];
}
