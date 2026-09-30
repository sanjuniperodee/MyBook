"use client";

import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, type ComponentProps } from "react";
import { localizePath, splitLocale, type Locale } from "./config";
import { messagesFor } from "./messages";

const LocaleContext = createContext<Locale>("ru");

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}

export function useMessages() {
  return messagesFor(useContext(LocaleContext));
}

/** Функция, превращающая «/books» в адрес на текущем языке. */
export function useLocalizePath() {
  const locale = useLocale();
  return useCallback((href: string) => localizePath(href, locale), [locale]);
}

/** Путь без языкового префикса — для сравнения активных пунктов меню. */
export function useLocalePathname() {
  return splitLocale(usePathname() ?? "/").path;
}

/** router с автоматическим языковым префиксом. */
export function useLocaleRouter() {
  const router = useRouter();
  const lp = useLocalizePath();
  return useMemo(() => ({ ...router, push: (href: string) => router.push(lp(href)), replace: (href: string) => router.replace(lp(href)) }), [router, lp]);
}

/** Ссылка, сохраняющая язык: href="/books" на казахской версии ведёт на /kk/books. */
export function Link({ href, ...props }: ComponentProps<typeof NextLink>) {
  const locale = useLocale();
  return <NextLink href={typeof href === "string" ? localizePath(href, locale) : href} {...props} />;
}
