import { milestoneOrder, type StageMilestone } from "@/modules/sales/domain/meta";

export type StageKind = "open" | "won" | "lost";

/** Этап воронки (справочник, который настраивает руководитель). */
export interface Stage {
  id: string;
  pipelineId: string;
  name: string;
  kind: StageKind;
  position: number;
  milestone: StageMilestone | null;
}

/**
 * Воронки и их этапы, упорядоченные как в настройках. Чистые правила: куда двигать сделку
 * по событию на сайте и нужно ли заводить сделку автоматически.
 */
export class Funnel {
  constructor(readonly stages: readonly Stage[]) {}

  stage(id: string) {
    return this.stages.find((s) => s.id === id) ?? null;
  }

  /** Основная воронка — первая по порядку: в неё попадают заявки с сайта, из чатов и звонков. */
  get defaultPipelineId(): string | null {
    return this.stages[0]?.pipelineId ?? null;
  }

  firstOfKind(kind: StageKind, pipelineId: string | null = this.defaultPipelineId) {
    return this.stages.filter((s) => s.kind === kind && s.pipelineId === pipelineId).sort((a, b) => a.position - b.position)[0] ?? null;
  }

  /** Этап с этим событием в нужной воронке. */
  milestoneStage(milestone: StageMilestone, pipelineId: string | null) {
    return this.stages.find((s) => s.milestone === milestone && s.pipelineId === pipelineId) ?? null;
  }

  /** Сделка идёт по событиям только вперёд; закрытые сделки события не трогают. */
  shouldAdvance(currentStageId: string, target: Stage) {
    const current = this.stage(currentStageId);
    if (!current || current.kind !== "open" || current.id === target.id) return false;
    return target.kind !== "open" || target.position > current.position;
  }

  /** Заводить ли сделку по событию: заказ — всегда (продажа должна попасть в аналитику), остальное — начиная с настройки. */
  static createsDeal(milestone: StageMilestone, autoFrom: StageMilestone | "off") {
    if (milestone === "order_created" || milestone === "order_paid") return true;
    return autoFrom !== "off" && milestoneOrder.indexOf(milestone) >= milestoneOrder.indexOf(autoFrom);
  }
}
