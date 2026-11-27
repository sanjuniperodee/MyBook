import type { StageMilestone } from "@/shared/domain/stageMilestones";
import { DEAL_CREATING_MILESTONES } from "@/shared/domain/stageMilestones";

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

  /** Самый дальний этап воронки из достигнутых вех (порядок — по позиции этапа). */
  furthest(milestones: readonly StageMilestone[], pipelineId: string) {
    let best: Stage | null = null;
    for (const m of milestones) {
      const s = this.milestoneStage(m, pipelineId);
      if (s && (!best || s.position > best.position)) best = s;
    }
    return best;
  }

  /** Воронки оплаченных — те, где есть этап «оплачено». */
  get paidPipelineIds(): string[] {
    return [...new Set(this.stages.filter((s) => s.milestone === "paid").map((s) => s.pipelineId))];
  }

  /**
   * Этап «оплачено» воронки оплаченных — куда переходит сделка, по которой пришли деньги. null — такой воронки нет или
   * сделка уже в ней (в её воронке есть этап «оплачено»).
   */
  paidStage(currentPipelineId: string | null) {
    if (currentPipelineId && this.milestoneStage("paid", currentPipelineId)) return null;
    return this.stages.find((s) => s.milestone === "paid" && s.kind === "open" && s.pipelineId !== currentPipelineId) ?? null;
  }

  /**
   * Сделка идёт по событиям только вперёд; отказ события не трогают. Успешная — только по успешным этапам своей воронки
   * дальше (воронка оплаченных: «Заказ оформлен» → «В печати» → «Отправлен» → «Получил книгу» — все «успех»: продажа
   * уже случилась, а заказ идёт своим путём).
   */
  shouldAdvance(currentStageId: string, target: Stage) {
    const current = this.stage(currentStageId);
    if (!current || current.id === target.id) return false;
    if (current.kind === "won") return target.kind === "won" && target.pipelineId === current.pipelineId && target.position > current.position;
    if (current.kind !== "open") return false;
    return target.kind !== "open" || target.position > current.position;
  }

  /** Заводить ли сделку по событию: заказ — всегда (продажа должна попасть в аналитику), остальное — начиная с настройки. */
  static createsDeal(milestone: StageMilestone, autoFrom: StageMilestone | "off") {
    if (milestone === "order_created" || milestone === "order_paid") return true;
    const order: readonly StageMilestone[] = DEAL_CREATING_MILESTONES;
    return autoFrom !== "off" && order.includes(milestone) && order.includes(autoFrom) && order.indexOf(milestone) >= order.indexOf(autoFrom);
  }
}

/** Какие вехи заказа уже позади при этом статусе заказа (отмена — никаких). */
export function orderMilestones(status: string | null): StageMilestone[] {
  const path: [string, StageMilestone][] = [
    ["pending_payment", "order_created"],
    ["paid", "order_paid"],
    ["in_production", "order_production"],
    ["shipped", "order_shipped"],
    ["delivered", "order_delivered"],
  ];
  const i = path.findIndex(([s]) => s === status);
  return i < 0 ? [] : path.slice(0, i + 1).map(([, m]) => m);
}
