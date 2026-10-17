import type { Deal } from "./Deal";
import type { Funnel } from "./Funnel";

export interface DealRepository {
  nextIdentity(): Promise<{ id: string; number: number }>;
  findById(id: string): Promise<Deal | null>;
  /** Несколько сделок одним запросом (массовые действия); ненайденных в ответе нет. */
  findByIds(ids: string[]): Promise<Deal[]>;
  findByOrder(orderId: string): Promise<Deal[]>;
  /** Открытая сделка клиента или номера — чтобы не плодить дубли. */
  findOpen(opts: { clientId?: string | null; phone?: string | null }): Promise<Deal | null>;
  add(deal: Deal): Promise<void>;
  /** Сохраняет поля, ленту и историю этапов. */
  save(deal: Deal): Promise<void>;
  /** Перенести переписку, звонки, задачи, ленту, деньги, чеки и тариф договорённости из source в target и удалить source. */
  mergeInto(target: Deal, source: Deal): Promise<void>;
  /**
   * Блокирует сделки до конца транзакции (по порядку id): удаление и слияние не разойдутся с одновременным платежом —
   * он либо уже виден, либо ждёт и не попадёт в удалённую сделку. Счета блокируются раньше (порядок: счета → сделки).
   */
  lock(dealIds: string[]): Promise<void>;
  delete(dealId: string): Promise<void>;
  /** По сделке приняты деньги (платежи или чеки) — её нельзя удалить, иначе они пропадут каскадом. */
  hasMoney(dealId: string): Promise<boolean>;
  addNote(deal: { id: string; clientId: string | null }, text: string, authorId: string | null, kind: "note" | "call" | "message" | "system"): Promise<void>;
  /** Открытые сделки без ответственного — круг раздаст их (старые первыми). */
  waitingForRoute(limit: number): Promise<string[]>;
  /** Неразобранные заявки с ответственным, назначенным раньше before, — их не взяли вовремя. */
  notTakenSince(before: Date, limit: number): Promise<string[]>;
}

export interface FunnelRepository {
  load(): Promise<Funnel>;
}
