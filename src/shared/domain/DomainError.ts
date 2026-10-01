/** Метка ошибок домена. Symbol.for — общий для всех слоёв бандла Next.js (RSC, server actions, роуты). */
const DOMAIN_ERROR = Symbol.for("mybook.domain-error");

/**
 * Нарушение бизнес-правила. code — стабильный машинный код (по нему слой представления
 * подбирает текст на языке пользователя), message — для логов и внутренних инструментов.
 *
 * Next.js может загрузить один модуль в разные слои бандла, и тогда `instanceof` ложно
 * отвечает «нет». Поэтому проверяйте ошибки через `XError.is(err)` — по метке и контексту.
 */
export class DomainError<TCode extends string = string> extends Error {
  readonly [DOMAIN_ERROR] = true;
  /** Контекст, в котором возникла ошибка: ordering, identity, access… */
  readonly context: string = "shared";

  constructor(
    readonly code: TCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = new.target.name;
  }

  static isDomainError(err: unknown): err is DomainError {
    return typeof err === "object" && err !== null && (err as Record<symbol, unknown>)[DOMAIN_ERROR] === true;
  }
}

/** Фабрика ошибок контекста с надёжной проверкой `is()`. */
export function contextError<TCode extends string>(context: string, name: string) {
  class ContextError extends DomainError<TCode> {
    override readonly context = context;
    static is(err: unknown): err is ContextError {
      return DomainError.isDomainError(err) && err.context === context;
    }
  }
  Object.defineProperty(ContextError, "name", { value: name });
  return ContextError;
}

/** Сущность не найдена (или скрыта от текущего пользователя). */
export class NotFoundError extends DomainError<"not_found"> {
  constructor(
    readonly entity: string,
    readonly id?: string | number,
  ) {
    super("not_found", `${entity} ${id ?? ""} not found`.trim());
  }
}

/** Доступ запрещён правилами домена (не путать с RBAC сотрудников). */
export class AccessDeniedError extends DomainError<"access_denied"> {
  constructor(message = "access denied") {
    super("access_denied", message);
  }
}
