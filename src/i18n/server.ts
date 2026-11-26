import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { defaultLocale, isLocale, LOCALE_COOKIE, LOCALE_HEADER, localizePath, type Locale } from "./config";
import { messagesFor } from "./messages";

const localeStorage = new AsyncLocalStorage<Locale>();

/** Выполнить `fn` с явным языком запроса (используется процессом NestJS без `next/headers`). */
export function runWithLocale<T>(locale: Locale, fn: () => T): T {
  return localeStorage.run(locale, fn);
}

/**
 * Язык текущего запроса: явный контекст процесса NestJS, иначе заголовок от proxy (страницы и server actions),
 * иначе выбор из cookie (API-маршруты, куда proxy не заходит), иначе русский.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const explicit = localeStorage.getStore();
  if (explicit) return explicit;
  const h = (await headers()).get(LOCALE_HEADER);
  if (isLocale(h)) return h;
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(c) ? c : defaultLocale;
});

export async function getMessages() {
  return messagesFor(await getLocale());
}

/** redirect() с сохранением языка. */
export async function lredirect(path: string): Promise<never> {
  redirect(localizePath(path, await getLocale()));
}
