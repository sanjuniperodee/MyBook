import type { ErrorKey, ErrorParams } from "@/i18n/api-errors";

/**
 * Ошибка HTTP-слоя: статус и ключ текста (словари api/admin) с параметрами. Ошибки предметной области — DomainError
 * своего контекста; оба вида переводит в ответ ApiExceptionFilter.
 */
export class ApiError<K extends ErrorKey = ErrorKey> extends Error {
  readonly params: unknown[];
  constructor(
    readonly status: number,
    readonly code: K,
    ...params: ErrorParams<K>
  ) {
    super(code);
    this.params = params;
  }
}
