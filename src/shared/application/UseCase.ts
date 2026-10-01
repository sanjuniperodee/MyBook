/**
 * Сценарий использования (application service): оркестрирует агрегаты, репозитории и порты.
 * Бизнес-правила живут в домене, а не здесь.
 */
export interface UseCase<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>;
}

/** Кто выполняет действие — для журналов и проверок. */
export interface Actor {
  /** Стабильная метка в журналах: customer, admin:email, cloudpayments, system… */
  readonly label: string;
  readonly userId?: string | null;
}

export const systemActor = (label = "system"): Actor => ({ label, userId: null });
