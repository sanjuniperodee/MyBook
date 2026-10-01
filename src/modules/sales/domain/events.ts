import { domainEvent, type DomainEvent } from "@/shared/domain";
import type { DealSource } from "@/modules/sales/domain/meta";

export interface DealRef {
  dealId: string;
  number: number;
  clientId: string | null;
  assigneeId: string | null;
}

export type DealCreated = DomainEvent<"sales.deal_created", DealRef & { title: string; source: DealSource; stageId: string; createdById: string | null }>;
export type DealStageChanged = DomainEvent<"sales.deal_stage_changed", DealRef & { fromStageId: string; stageId: string; source: DealSource; at: string }>;
export type DealAssigned = DomainEvent<"sales.deal_assigned", DealRef & { title: string }>;
export type SalesEvent = DealCreated | DealStageChanged | DealAssigned;

export const SalesEvents = {
  dealCreated: (p: DealCreated["payload"]): DealCreated => domainEvent("sales.deal_created", p),
  dealStageChanged: (p: DealStageChanged["payload"]): DealStageChanged => domainEvent("sales.deal_stage_changed", p),
  dealAssigned: (p: DealAssigned["payload"]): DealAssigned => domainEvent("sales.deal_assigned", p),
};
