import { admin } from "@/i18n/admin";
import { errorText } from "@/i18n/api-errors";
import { messagesFor, type Messages } from "@/i18n/messages";
import type { IdentityErrorCode } from "@/modules/identity";
import type { OrderingErrorCode } from "@/modules/ordering";
import { DomainError } from "@/shared/domain";

/**
 * Тексты ошибок домена для форм и API — чистый модуль без Next и запроса (ADR 0014).
 * Используется и в server actions сайта (`src/server/errors.ts`), и в бэкенде на Nest (`apps/backend`),
 * чтобы тексты ошибок Identity/Ordering не расходились между процессами.
 */

const has = (dictionary: object, key: string) => Object.prototype.hasOwnProperty.call(dictionary, key);

export type ErrorKind = { is(err: unknown): boolean };

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
    planUnavailable: errors.planUnavailable,
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
 * (access, sales, clients…) message — готовый текст для сотрудника, а код без message — ключ словаря admin (только сотруднику).
 */
function domainText(m: Messages, err: DomainError, staff = false): string | null {
  if (err.context === "identity") return identityText(m, err, staff);
  if (err.context === "ordering") return orderingText(m, err);
  return messageText(err) ?? (staff && has(admin, err.code) ? errorText(m.api, err.code, [...err.params]) : null);
}

/** Ошибка домена, которую действие ждёт (`only` пуст — любая); остальное оно пробросит. */
function expected(err: unknown, only: ErrorKind[]): err is DomainError {
  return DomainError.isDomainError(err) && (only.length === 0 || only.some((kind) => kind.is(err)));
}

/**
 * Ошибка домена → текст для ответа на переданном словаре языка; null — это не ожидаемая ошибка, её нужно пробросить.
 * `only` — какие ошибки ждёт обработчик (IdentityError, OrderingError…): остальные доменные ошибки не трогаем.
 */
export function errorMessageFor(messages: Messages, err: unknown, ...only: ErrorKind[]): string | null {
  return expected(err, only) ? domainText(messages, err) : null;
}

/** То же для действий сотрудника CRM (всегда по-русски, с текстами admin). */
export function staffErrorMessageFor(err: unknown, ...only: ErrorKind[]): string | null {
  return expected(err, only) ? domainText(messagesFor("ru"), err, true) : null;
}
