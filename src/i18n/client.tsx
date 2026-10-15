"use client";

import dynamic from "next/dynamic";
import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, type ComponentProps } from "react";
import { localizePath, splitLocale, type Locale } from "./config";
import { MessagesContext } from "./context";
import type { ClientMessages } from "./messages";

const LocaleContext = createContext<Locale>("ru");

// Словарь каждого языка — свой чанк: браузер грузит только язык страницы. При первой отрисовке на сервере
// next/dynamic отмечает нужный чанк, и браузер загружает его вместе с остальными, без лишнего запроса после.
// Язык меняется только полной навигацией (LanguageSwitch → location.assign): смена Dictionary при клиентском
// переходе перемонтировала бы всё дерево. Если чанк не загрузится, ошибку покажет app/global-error.tsx.
const dictionaries: Record<Locale, React.ComponentType<{ children: React.ReactNode }>> = {
  ru: dynamic(() => import("./dictionary/ru")),
  kk: dynamic(() => import("./dictionary/kk")),
};

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const Dictionary = dictionaries[locale];
  return (
    <LocaleContext.Provider value={locale}>
      <Dictionary>{children}</Dictionary>
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}

/** Словарь языка страницы (без серверных пространств — см. ClientMessages). */
export function useMessages(): ClientMessages {
  const messages = useContext(MessagesContext);
  if (!messages) throw new Error("useMessages: нет I18nProvider");
  return messages;
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
