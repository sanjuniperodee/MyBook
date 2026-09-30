import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { defaultLocale, isLocale, LOCALE_COOKIE, LOCALE_HEADER, localizePath, type Locale } from "./config";
import { messagesFor } from "./messages";

/**
 * Язык текущего запроса: заголовок от proxy (страницы и server actions), иначе выбор из cookie
 * (API-маршруты, куда proxy не заходит), иначе русский.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const h = (await headers()).get(LOCALE_HEADER);
  if (isLocale(h)) return h;
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(c) ? c : defaultLocale;
});

export async function getMessages() {
  return messagesFor(await getLocale());
}

/** Путь на языке текущего запроса. */
export async function lpath(path: string) {
  return localizePath(path, await getLocale());
}

/** redirect() с сохранением языка. */
export async function lredirect(path: string): Promise<never> {
  redirect(localizePath(path, await getLocale()));
}
