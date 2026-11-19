import type { Locale } from "../config";
import { ru } from "./ru";
import { kk } from "./kk";
import { uz } from "./uz";

/** Структура словаря задаётся русским; казахский и узбекский обязаны повторить её целиком — пропуск не скомпилируется. */
export type Messages = typeof ru;

/**
 * Словарь в браузере (useMessages): без серверных пространств (письма, юр. тексты, ошибки API, сообщения доступа в WhatsApp). Страница получает словарь только своего языка
 * (i18n/dictionary/*), а части на другом языке — из messages/partial.ts.
 */
export type ClientMessages = Omit<Messages, "mail" | "legal" | "api" | "access" | "answerFile">;

const dictionaries: Record<Locale, Messages> = { ru, kk, uz };

export function messagesFor(locale: Locale): Messages {
  return dictionaries[locale];
}
