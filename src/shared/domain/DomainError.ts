/**
 * Метка ошибок домена — обычное имя свойства: одно для всех слоёв бандла Next.js (RSC, server actions, роуты) и видно
 * в объявлениях типов (пакет типов бэкенда для веба, ADR 0013), в отличие от символа.
 */
const DOMAIN_ERROR = "__mybookDomainError";

/**
 * Нарушение бизнес-правила. code — стабильный машинный код (по нему слой представления
 * подбирает текст на языке пользователя), params — значения для этого текста, message — для логов и внутренних инструментов.
 *
 * Next.js может загрузить один модуль в разные слои бандла, и тогда `instanceof` ложно
 * отвечает «нет». Поэтому проверяйте ошибки через `XError.is(err)` — по метке и контексту.
 */
export class DomainError<TCode extends string = string> extends Error {
  readonly __mybookDomainError = true;
  /** Контекст, в котором возникла ошибка: ordering, identity, access… */
  readonly context: string = "shared";

  constructor(
    readonly code: TCode,
    message?: string,
    /** Значения для текста словаря, если он зависит от них (предел фото: «до 120 фото»). */
    readonly params: readonly unknown[] = [],
  ) {
    super(message ?? code);
    this.name = new.target.name;
  }

  static isDomainError(err: unknown): err is DomainError {
    return typeof err === "object" && err !== null && (err as Record<string, unknown>)[DOMAIN_ERROR] === true;
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
