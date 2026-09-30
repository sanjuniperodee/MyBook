import type { Locale } from "../config";
import { ru } from "./ru";
import { kk } from "./kk";

/** Структура словаря задаётся русским; казахский обязан повторить её целиком — пропуск не скомпилируется. */
export type Messages = typeof ru;

const dictionaries: Record<Locale, Messages> = { ru, kk };

export function messagesFor(locale: Locale): Messages {
  return dictionaries[locale];
}
