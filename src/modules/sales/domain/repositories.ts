import type { Deal } from "./Deal";
import type { Funnel } from "./Funnel";

export interface DealRepository {
  nextIdentity(): Promise<{ id: string; number: number }>;
  findById(id: string): Promise<Deal | null>;
  findByOrder(orderId: string): Promise<Deal[]>;
  /** Открытая сделка клиента или номера — чтобы не плодить дубли. */
  findOpen(opts: { clientId?: string | null; phone?: string | null }): Promise<Deal | null>;
  add(deal: Deal): Promise<void>;
  /** Сохраняет поля, ленту и историю этапов. */
  save(deal: Deal): Promise<void>;
  /** Перенести переписку, звонки, задачи и ленту из source в target и удалить source. */
  mergeInto(target: Deal, source: Deal): Promise<void>;
  delete(dealId: string): Promise<void>;
  addNote(deal: { id: string; clientId: string | null }, text: string, authorId: string | null, kind: "note" | "call" | "message" | "system"): Promise<void>;
}

export interface FunnelRepository {
  load(): Promise<Funnel>;
}
