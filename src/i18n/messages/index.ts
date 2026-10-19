import type { Locale } from "../config";
import { ru } from "./ru";
import { kk } from "./kk";

/** Структура словаря задаётся русским; казахский обязан повторить её целиком — пропуск не скомпилируется. */
export type Messages = typeof ru;

/**
 * Словарь в браузере (useMessages): без серверных пространств (письма, юр. тексты, ошибки API, сообщения доступа в WhatsApp). Страница получает словарь только своего языка
 * (i18n/dictionary/*), а части на другом языке — из messages/partial.ts.
 */
export type ClientMessages = Omit<Messages, "mail" | "legal" | "api" | "access">;

const dictionaries: Record<Locale, Messages> = { ru, kk };

export function messagesFor(locale: Locale): Messages {
  return dictionaries[locale];
}
