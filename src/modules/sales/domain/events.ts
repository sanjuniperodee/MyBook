import { domainEvent, type DomainEvent } from "@/shared/domain";
import type { DealSource } from "@/shared/domain/dealSources";

export interface DealRef {
  dealId: string;
  number: number;
  clientId: string | null;
  assigneeId: string | null;
}

export type DealCreated = DomainEvent<"sales.deal_created", DealRef & { title: string; source: DealSource; stageId: string; createdById: string | null }>;
export type DealStageChanged = DomainEvent<"sales.deal_stage_changed", DealRef & { fromStageId: string; stageId: string; source: DealSource; at: string }>;
/** Сменился ответственный: fromAssigneeId — прежний (его чаты сделки переходят новому). */
export type DealAssigned = DomainEvent<"sales.deal_assigned", DealRef & { fromAssigneeId: string | null; title: string }>;
/**
 * Сделка закрыта: успех или отказ (и заявка, отклонённая руководителем, если удалить её нельзя). reason — причина отказа.
 * Открытые счета из чата по ней отменяются (подписчик заказов): платить по закрытой сделке нельзя.
 */
export type DealClosed = DomainEvent<"sales.deal_closed", DealRef & { outcome: "won" | "lost"; reason: string | null }>;
export type SalesEvent = DealCreated | DealStageChanged | DealAssigned | DealClosed;

export const SalesEvents = {
  dealCreated: (p: DealCreated["payload"]): DealCreated => domainEvent("sales.deal_created", p),
  dealStageChanged: (p: DealStageChanged["payload"]): DealStageChanged => domainEvent("sales.deal_stage_changed", p),
  dealAssigned: (p: DealAssigned["payload"]): DealAssigned => domainEvent("sales.deal_assigned", p),
  dealClosed: (p: DealClosed["payload"]): DealClosed => domainEvent("sales.deal_closed", p),
};
