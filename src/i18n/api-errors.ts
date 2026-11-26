import { admin } from "@/i18n/admin";
import type { Messages } from "@/i18n/messages";

/**
 * Реестр ошибок API — чистый, без Next и запроса: ключи текстов (словари api и admin), тексты по ключу и статус HTTP для
 * кода ошибки домена. Им пользуются оба HTTP-процесса — mybook-api (src/server/api.ts) и бэкенд на Nest
 * (apps/backend/src/core/errors) — чтобы коды, статусы и тексты не расходились (ADR 0014).
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
  // Свои видео и аудио (authoring/infrastructure/answerFiles.ts): те же статусы, что отдавал прежний HttpError.
  ["fileType", 415],
  ["fileTooBig", 413],
  ["fileBusy", 503],
  ["fileLimit", 409],
  ["fileTooLong", 422],
  ["fileQuota", 402],
  ["fileChunk", 409],
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
