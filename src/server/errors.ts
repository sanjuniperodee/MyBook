import "server-only";
import { admin } from "@/i18n/admin";
import type { Messages } from "@/i18n/messages";
import { messagesFor } from "@/i18n/messages";
import { getMessages } from "@/i18n/server";
import type { IdentityErrorCode } from "@/modules/identity";
import type { OrderingErrorCode } from "@/modules/ordering";
import { DomainError } from "@/shared/domain";

/**
 * Единые ошибки веб-слоя: реестр «код домена → статус HTTP» и тексты по ключам словарей.
 * Ответ роутов собирает api() (api.ts), ошибки server actions — actionError() (покупатель, на его языке) и
 * staffActionError() (сотрудник CRM, всегда по-русски); сюда ходят за статусом и текстом.
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
 * Статус HTTP для кода ошибки домена. Код, которого нет в реестре, — 400; «notFound» и коды «…NotFound» — 404.
 */
const STATUS_BY_CODE = new Map<string, number>([
  ["bookLocked", 409],
  ["bookHasOrders", 409],
  ["letterPrinted", 409],
  ["reviewLocked", 409],
  ["reviewNotAllowed", 403],
  ["kaspiUnavailable", 503],
  ["kaspiNotConnected", 503],
  ["kaspiSessionShared", 409],
  ["letterClosed", 404],
  ["letterInvalid", 404],
  // Оглавление своей книги: операция не для этой книги и устаревший вид у клиента — конфликт состояния.
  ["outlineNotAllowed", 409],
  ["outlineOutdated", 409],
]);

export function domainStatus(code: string): number {
  return STATUS_BY_CODE.get(code) ?? (/NotFound$/i.test(code) ? 404 : 400);
}

type ErrorKind = { is(err: unknown): boolean };

/**
 * Каждый код IdentityError — ключ auth.errors (в зависимости от языка запроса); 2FA сотрудника — словарь admin.
 * Руководителю при добавлении сотрудника «Войдите в аккаунт» не подходит — для него свой текст кода exists.
 */
function identityText(m: Messages, err: DomainError, staff: boolean): string {
  const texts: Record<IdentityErrorCode, string> = { ...m.auth.errors, twoFactorAlreadyOn: admin.twoFactorAlreadyOn };
  if (staff) texts.exists = admin.staffEmailExists;
  return has(texts, err.code) ? texts[err.code as IdentityErrorCode] : m.auth.errors.credentials;
}

/**
 * Код OrderingError совпадает с ключом словаря (docs/architecture.md): оформление — checkout.promo и checkout.errors,
 * платёж и подарок — api и gift, действия сотрудника над заказом — admin. notReady несёт готовый текст: что мешает заказать книгу.
 */
function orderingText(m: Messages, err: DomainError): string | null {
  const { promo, errors } = m.checkout;
  const texts: Record<OrderingErrorCode, string> = {
    bookNotFound: errors.bookNotFound,
    alreadyOrdered: errors.alreadyOrdered,
    upgradeUnavailable: errors.upgradeUnavailable,
    notReady: err.message,
    promoGone: errors.promoGone,
    empty: promo.empty,
    notFound: promo.notFound,
    expired: promo.expired,
    used: promo.used,
    ownCode: promo.ownCode,
    firstOrderOnly: promo.firstOrderOnly,
    orderNotFound: m.api.orderNotFound,
    invalidTransition: admin.invalidTransition,
    promoExists: admin.promoExists,
    staffNotFound: admin.staffNotFound,
    giftNotFound: m.api.notFound,
    giftPastDate: m.gift.form.errors.pastDate,
    giftNeedEmail: m.gift.form.errors.needEmail,
    notPayable: m.api.notPayable,
    phoneInvalid: m.api.phoneInvalid,
    invoiceNotFound: m.api.invoiceNotFound,
    kaspiNotConnected: m.api.kaspiNotConnected,
    // Только из «Интеграций» (там свой текст); клиенту не попадает.
    kaspiSessionShared: m.api.kaspiNotConnected,
    kaspiUnavailable: m.api.kaspiUnavailable,
    invalidAmount: m.api.invalidAmount,
    receiptInvalid: m.api.receiptInvalid,
    // Правило денег по заказу для сотрудника (не оплачен — в печать только с постоплатой и т. п.): текст в самой ошибке.
    paymentRule: err.message,
  };
  return has(texts, err.code) ? texts[err.code as OrderingErrorCode] : messageText(err);
}

/** message как готовый текст для сотрудника; если его нет (message — сам код), текста нет: машинный код не показываем. */
const messageText = (err: DomainError) => (err.message === err.code ? null : err.message);

/**
 * Текст ошибки домена для пользователя. Identity и ordering — из словарей по коду; у остальных контекстов
 * (access, sales, clients…) message — готовый текст для сотрудника.
 */
function domainText(m: Messages, err: DomainError, staff = false): string | null {
  if (err.context === "identity") return identityText(m, err, staff);
  if (err.context === "ordering") return orderingText(m, err);
  return messageText(err);
}

/** Ошибка домена, которую действие ждёт (`only` пуст — любая); остальное оно пробросит. */
function expected(err: unknown, only: ErrorKind[]): err is DomainError {
  return DomainError.isDomainError(err) && (only.length === 0 || only.some((kind) => kind.is(err)));
}

/**
 * Ошибка домена в server action покупателя → текст для формы на языке запроса; null — это не та ошибка, её нужно пробросить.
 * `only` — какие ошибки ждёт действие (IdentityError, OrderingError…): остальные доменные ошибки не трогаем.
 */
export async function actionError(err: unknown, ...only: ErrorKind[]): Promise<string | null> {
  return expected(err, only) ? domainText(await getMessages(), err) : null;
}

/**
 * То же для server action сотрудника CRM: админка всегда по-русски, а proxy в /admin язык не ставит и getLocale()
 * берёт cookie сайта — сотрудник, открывавший казахскую версию, получил бы казахские тексты.
 */
export function staffActionError(err: unknown, ...only: ErrorKind[]): string | null {
  return expected(err, only) ? domainText(messagesFor("ru"), err, true) : null;
}
