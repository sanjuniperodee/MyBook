/**
 * Нарушение бизнес-правила. code — стабильный машинный код (по нему слой представления
 * подбирает текст на языке пользователя), message — для логов и внутренних инструментов.
 */
export class DomainError<TCode extends string = string> extends Error {
  constructor(
    readonly code: TCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = new.target.name;
  }
}

/** Сущность не найдена (или скрыта от текущего пользователя). */
export class NotFoundError extends DomainError<"not_found"> {
  constructor(readonly entity: string, readonly id?: string | number) {
    super("not_found", `${entity} ${id ?? ""} not found`.trim());
  }
}

/** Доступ запрещён правилами домена (не путать с RBAC сотрудников). */
export class AccessDeniedError extends DomainError<"access_denied"> {
  constructor(message = "access denied") {
    super("access_denied", message);
  }
}
