/**
 * Реестр «код ошибки домена → статус HTTP». Одно место для роутов: api() берёт статус отсюда.
 * Код, которого здесь нет, — 400; коды «…NotFound» — 404.
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
