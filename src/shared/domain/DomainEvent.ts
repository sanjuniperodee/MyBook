/**
 * Доменное событие: факт, который уже произошёл в агрегате («заказ оплачен»).
 * Другие контексты реагируют на события, а не вызывают друг друга напрямую.
 */
export interface DomainEvent<TType extends string = string, TPayload = unknown> {
  readonly type: TType;
  readonly payload: TPayload;
  readonly occurredAt: Date;
}

export function domainEvent<TType extends string, TPayload>(type: TType, payload: TPayload, occurredAt = new Date()): DomainEvent<TType, TPayload> {
  return Object.freeze({ type, payload, occurredAt });
}
