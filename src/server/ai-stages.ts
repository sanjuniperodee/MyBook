import "server-only";
import { container } from "@/server/container";
import { getSetting } from "@/modules/workspace";
import { lostReasons, stageMilestones } from "@/modules/sales/domain/meta";
import { AI_STAGES, aiStageDecision, parseAiStages, quoteIn, stageRoles, type AiStageOption, type AiStagesConfig } from "@/shared/domain/aiStages";
import type { AiProposalPayload } from "@/shared/domain/aiProposals";
import type { StageMilestone } from "@/shared/domain/stageMilestones";
import { fromZonedTime, zonedDay } from "@/shared/domain/time";

/** Что этап значит для модели — по роли и вехе этапа, а не по названию (этапы переименовывают). */
export function stageAbout(s: AiStageOption): string {
  const milestone = s.milestone ? `; сюда сделка идёт сама, когда «${stageMilestones[s.milestone as StageMilestone] ?? s.milestone}»` : "";
  switch (s.role) {
    case "entry":
      return "новая заявка: клиент написал, разговор ещё не начался";
    case "work":
      return "в работе: идёт разговор, клиент интересуется, задаёт вопросы, выбирает";
    case "silent":
      return "клиент перестал отвечать или сказал, что подумает, посоветуется, вернётся позже";
    case "paid":
      return `клиент оплатил (предоплату или полностью)${milestone}`;
    case "won":
      return "заказ оформлен на сайте — этот этап ставит сайт, сам не выбирай";
    case "lost":
      return "клиент отказался или это не покупатель";
    default:
      return milestone ? milestone.slice(2) : "свой этап воронки";
  }
}

interface Candidate {
  id: string;
  stageId: string;
  order: { id: string; number: number; status: string } | null;
}

interface ReviewMessage {
  id?: string;
  direction: "in" | "out";
  text: string;
}

export interface AiStagesDeps {
  config(): Promise<AiStagesConfig>;
  aiReady(): Promise<boolean>;
  reviewedToday(): Promise<number>;
  /** Основная воронка: её этапы с ролями и причины отказа. */
  funnel(): Promise<{ pipelineId: string; stages: AiStageOption[] } | null>;
  candidates(f: { pipelineId: string; limit: number }): Promise<Candidate[]>;
  markReviewed(dealId: string): Promise<void>;
  review(dealId: string, input: { stages: { n: number; name: string; about: string }[]; current: string; reasons: string[]; messages: number }): Promise<{
    review: { stage: number | null; confidence: number; reason: string; quote: string; message: number | null; lostReason: string | null; delivered: { quote: string; message: number | null } | null } | null;
    messages: ReviewMessage[];
  }>;
  move(dealId: string, stageId: string, lostReason: string | null, ai: { reason: string; quote: string | null; messageId: string | null }): Promise<void>;
  propose(p: { dealId: string; kind: "stage" | "order_status"; payload: AiProposalPayload; reason: string; quote: string | null; messageId: string | null; confidence: number }): Promise<boolean>;
  logError(err: unknown): void;
}

export interface AiStagesResult {
  reviewed: number;
  applied: number;
  proposed: number;
}

/** Причины отказа, из которых выбирает ИИ: «Не отвечает» ставит «Порядок в воронке» по молчанию, а не ИИ. */
const AI_REASONS = lostReasons.filter((r) => r !== "Не отвечает");

/**
 * «ИИ ведёт этапы» (crm.aiStages, по умолчанию выключено): раз в минуту до AI_STAGES.batch сделок с новой затихшей
 * перепиской (не больше perDay в сутки) — модель говорит, где сделка на самом деле, с дословной цитатой и номером сообщения.
 * Цитату сервер ищет в этом сообщении: не нашлась — вывод не принимается. Что менять самому, а что предложить менеджеру,
 * решает aiStageDecision; изменение пишется в историю этапов и ленту с пометкой «ИИ», причиной и цитатой. Клиент сказал,
 * что получил книгу, — предложение отметить заказ выданным (только предложением). Отметка разбора ставится до запроса:
 * ошибка модели не зацикливает сделку, следующий разбор — после нового сообщения.
 */
export async function aiStagesPass(d: AiStagesDeps): Promise<AiStagesResult | null> {
  const cfg = await d.config();
  if (!cfg.on || !(await d.aiReady())) return null;
  const left = AI_STAGES.perDay - (await d.reviewedToday());
  if (left <= 0) return null;
  const funnel = await d.funnel();
  if (!funnel) return null;
  const list = funnel.stages.map((s, i) => ({ n: i + 1, name: s.name, about: stageAbout(s) }));
  const result: AiStagesResult = { reviewed: 0, applied: 0, proposed: 0 };
  for (const c of await d.candidates({ pipelineId: funnel.pipelineId, limit: Math.min(AI_STAGES.batch, left) })) {
    const current = funnel.stages.find((s) => s.id === c.stageId);
    if (!current) continue;
    try {
      await d.markReviewed(c.id);
      const { review, messages } = await d.review(c.id, { stages: list, current: current.name, reasons: AI_REASONS, messages: AI_STAGES.messages });
      result.reviewed++;
      if (!review) continue;
      const target = review.stage ? (funnel.stages[review.stage - 1] ?? null) : null;
      const msg = review.message ? messages[review.message - 1] : undefined;
      const lostReason = target?.kind === "lost" ? review.lostReason : null;
      const decision = aiStageDecision({ current, target, confidence: review.confidence, quoteOk: !!msg && quoteIn(review.quote, msg.text), quoteFromClient: msg?.direction === "in", lostReason });
      const ai = { reason: review.reason || "по переписке", quote: review.quote || null, messageId: msg?.id ?? null };
      if (target && decision === "apply") {
        await d.move(c.id, target.id, lostReason, ai);
        result.applied++;
      } else if (target && decision === "propose") {
        if (await d.propose({ dealId: c.id, kind: "stage", payload: { fromStageId: current.id, stageId: target.id, stageName: target.name, lostReason }, ...ai, confidence: review.confidence })) result.proposed++;
      }
      // Книга у клиента, а заказ всё ещё «в печати» или «в пути» — предложить отметить выданным.
      const dm = review.delivered?.message ? messages[review.delivered.message - 1] : undefined;
      if (c.order && (c.order.status === "in_production" || c.order.status === "shipped") && review.delivered && dm && quoteIn(review.delivered.quote, dm.text)) {
        const ok = await d.propose({
          dealId: c.id,
          kind: "order_status",
          payload: { orderId: c.order.id, orderNumber: c.order.number, fromStatus: c.order.status, status: "delivered" },
          reason: "клиент получил книгу",
          quote: review.delivered.quote,
          messageId: dm.id ?? null,
          confidence: review.confidence,
        });
        if (ok) result.proposed++;
      }
    } catch (err) {
      d.logError(err);
    }
  }
  return result;
}

/** Порты из контекстов: настройки, продажи (воронка, этапы, предложения), отчёты (выборка), помощник (модель). */
export function aiStagesDeps(now = new Date()): AiStagesDeps {
  const c = container();
  return {
    config: async () => parseAiStages(await getSetting("crm.aiStages")),
    aiReady: () => c.assistant.service.configured(),
    reviewedToday: () => c.sales.aiProposals.reviewedSince(fromZonedTime(`${zonedDay(now)}T00:00`)),
    async funnel() {
      const [pipeline] = await c.sales.queries.listPipelines();
      if (!pipeline) return null;
      const stages = await c.sales.queries.listStages(pipeline.id);
      return { pipelineId: pipeline.id, stages: stageRoles(stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind, position: s.position, milestone: s.milestone ?? null })), await getSetting("crm.stageOrder")) };
    },
    candidates: (f) => c.reporting.aiStageCandidates({ ...f, quietMinutes: AI_STAGES.quietMinutes, lookbackDays: AI_STAGES.lookbackDays, lostDays: AI_STAGES.lookbackDays * 2, now }),
    markReviewed: (dealId) => c.sales.aiProposals.markReviewed(dealId, now),
    review: (dealId, input) => c.assistant.service.reviewStage(dealId, input),
    move: async (dealId, stageId, lostReason, ai) => {
      await c.sales.deals.move(dealId, stageId, null, lostReason, ai);
      await c.sales.aiProposals.staleStage(dealId);
    },
    propose: (p) => c.sales.aiProposals.add(p),
    logError: (err) => console.error("[ai stages]", err),
  };
}
