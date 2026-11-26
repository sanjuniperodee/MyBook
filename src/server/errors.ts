import "server-only";
import { getMessages } from "@/i18n/server";
import { errorMessageFor, staffErrorMessageFor, type ErrorKind } from "@/i18n/domain-errors";

/**
 * Единые ошибки веб-слоя: реестр «код домена → статус HTTP» и тексты по ключам словарей.
 * Ответ роутов собирает api() (api.ts), ошибки server actions — actionError() (покупатель, на его языке) и
 * staffActionError() (сотрудник CRM, всегда по-русски); сюда ходят за статусом и текстом.
 */

import { domainStatus, errorText, isApiKey, isErrorKey, type ApiMessages, type ErrorKey, type ErrorParams } from "@/i18n/api-errors";

export { domainStatus, errorText, isApiKey, isErrorKey, type ApiMessages, type ErrorKey, type ErrorParams };

/**
 * Ошибка домена в server action покупателя → текст для формы на языке запроса; null — это не та ошибка, её нужно пробросить.
 * `only` — какие ошибки ждёт действие (IdentityError, OrderingError…): остальные доменные ошибки не трогаем.
 */
export async function actionError(err: unknown, ...only: ErrorKind[]): Promise<string | null> {
  return errorMessageFor(await getMessages(), err, ...only);
}

/**
 * То же для server action сотрудника CRM: админка всегда по-русски, а proxy в /admin язык не ставит и getLocale()
 * берёт cookie сайта — сотрудник, открывавший казахскую версию, получил бы казахские тексты.
 */
export function staffActionError(err: unknown, ...only: ErrorKind[]): string | null {
  return staffErrorMessageFor(err, ...only);
}
