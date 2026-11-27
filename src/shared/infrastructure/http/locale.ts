/**
 * Язык текущего запроса бэкенда. Та же логика, что у src/i18n/server.ts (тот остаётся вебу и работает с настоящим
 * next/headers): явный язык процесса (runWithLocale), иначе заголовок от прокси веба, иначе cookie, иначе русский.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { defaultLocale, isLocale, LOCALE_COOKIE, LOCALE_HEADER, localizePath, type Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { cookies, headers, redirect } from "./request";

const localeStorage = new AsyncLocalStorage<Locale>();

/** Выполнить `fn` с явным языком запроса. */
export function runWithLocale<T>(locale: Locale, fn: () => T): T {
  return localeStorage.run(locale, fn);
}

export async function getLocale(): Promise<Locale> {
  const explicit = localeStorage.getStore();
  if (explicit) return explicit;
  const h = (await headers()).get(LOCALE_HEADER);
  if (isLocale(h)) return h;
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(c) ? c : defaultLocale;
}

export async function getMessages() {
  return messagesFor(await getLocale());
}

/** redirect() с сохранением языка. */
export async function lredirect(path: string): Promise<never> {
  redirect(localizePath(path, await getLocale()));
}
