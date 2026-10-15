import "server-only";
import { admin } from "@/i18n/admin";
import type { Messages } from "@/i18n/messages";
import { getMessages } from "@/i18n/server";
import { DomainError } from "@/shared/domain";

/**
 * Единые ошибки веб-слоя: реестр «код домена → статус HTTP» и тексты по ключам словарей.
 * Ответ роутов собирает api() (api.ts), ошибки server actions — actionError(); сюда ходят за статусом и текстом.
 */

export type ApiMessages = Messages["api"];
/** Ключ ошибки роута: словарь api (на языке пользователя) или admin (тексты для CRM, только по-русски). */
export type ErrorKey = keyof ApiMessages | keyof typeof admin;
type Texts = ApiMessages & typeof admin;
export type ErrorParams<K extends ErrorKey> = Texts[K] extends (...a: infer A) => string ? A : [];

const has = (dictionary: object, key: string) => Object.prototype.hasOwnProperty.call(dictionary, key);

export function isApiKey(t: ApiMessages, key: string): key is keyof ApiMessages {
  return has(t, key);
}

/** Ключ любого из двух словарей: на него роут может ответить кодом в поле code. */
export function isErrorKey(t: ApiMessages, key: string): key is ErrorKey {
  return has(t, key) || has(admin, key);
}

/** Текст ошибки по ключу; незнакомая строка возвращается как есть. */
export function errorText(t: ApiMessages, key: string, params: unknown[] = []): string {
  const v = has(t, key) ? t[key as keyof ApiMessages] : has(admin, key) ? admin[key as keyof typeof admin] : undefined;
  if (v === undefined) return key;
  return typeof v === "function" ? (v as (...a: unknown[]) => string)(...params) : v;
}

/**
 * Статус HTTP для кода ошибки домена. Код, которого нет в реестре, — 400; коды «…NotFound» — 404.
 */
const STATUS_BY_CODE = new Map<string, number>([
  ["bookLocked", 409],
  ["bookHasOrders", 409],
  ["letterPrinted", 409],
  ["reviewLocked", 409],
  ["reviewNotAllowed", 403],
  ["kaspiUnavailable", 503],
  ["kaspiNotConnected", 503],
  ["letterClosed", 404],
  ["letterInvalid", 404],
]);

export function domainStatus(code: string): number {
  return STATUS_BY_CODE.get(code) ?? (/NotFound$/.test(code) ? 404 : 400);
}

type ErrorKind = { is(err: unknown): boolean };

/** Коды IdentityError, у которых есть текст в auth.errors; остальные показываем как «неверный логин или пароль». */
function identityText(e: Messages["auth"]["errors"], code: string): string {
  const texts: Partial<Record<string, string>> = {
    email: e.email,
    phone: e.phone,
    password: e.password,
    exists: e.exists,
    credentials: e.credentials,
    resetExpired: e.resetExpired,
    twoFactorCode: e.twoFactorCode,
    twoFactorExpired: e.twoFactorExpired,
  };
  return texts[code] ?? e.credentials;
}

/**
 * Код OrderingError совпадает с ключом словаря (docs/architecture.md): оформление — checkout.promo и checkout.errors,
 * действия сотрудника над заказом — api и admin. notReady несёт готовый текст: что мешает заказать книгу.
 */
function orderingText(m: Messages, err: DomainError): string {
  const { promo, errors } = m.checkout;
  switch (err.code) {
    case "empty":
    case "notFound":
    case "expired":
    case "used":
    case "ownCode":
    case "firstOrderOnly":
      return promo[err.code];
    case "bookNotFound":
    case "alreadyOrdered":
    case "promoGone":
    case "upgradeUnavailable":
      return errors[err.code];
    case "orderNotFound":
      return m.api.orderNotFound;
    case "invalidTransition":
    case "staffNotFound":
    case "promoExists":
      return admin[err.code];
    default:
      return err.message;
  }
}

/** Текст ошибки домена для пользователя: по контексту ошибки; у остальных message — готовый текст для сотрудника. */
export function domainText(m: Messages, err: DomainError): string {
  if (err.context === "identity") return identityText(m.auth.errors, err.code);
  if (err.context === "ordering") return orderingText(m, err);
  return err.message;
}

/**
 * Ошибка домена в server action → текст для формы на языке запроса; null — это не та ошибка, её нужно пробросить.
 * `only` — какие ошибки ждёт действие (IdentityError, AccessError…): остальные доменные ошибки не трогаем.
 */
export async function actionError(err: unknown, ...only: ErrorKind[]): Promise<string | null> {
  if (!DomainError.isDomainError(err) || (only.length > 0 && !only.some((kind) => kind.is(err)))) return null;
  return domainText(await getMessages(), err);
}
