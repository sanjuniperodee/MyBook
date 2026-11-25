/** Тексты удаления аккаунта на любом языке: кабинет сайта и API v1 (приложение) берут их отсюда — один источник. */
import type { Locale } from "../config";
import { accountDeletion as en } from "./en/account-deletion";
import { accountDeletion as kk } from "./kk/account-deletion";
import { accountDeletion as ru } from "./ru/account-deletion";
import { accountDeletion as uz } from "./uz/account-deletion";

const byLocale = { ru, kk, uz, en } satisfies Record<Locale, typeof ru>;

export type AccountDeletionMessages = typeof ru;
export const accountDeletionFor = (locale: Locale): AccountDeletionMessages => byLocale[locale];
