import "server-only";
import { container } from "@/server/container";
import { getSetting } from "@/modules/workspace";
import { lostReasons, stageMilestones } from "@/modules/sales/domain/meta";
import { AI_STAGES, aiManagerDecision, aiStageDecision, nameInText, parseAiStages, quoteIn, stageRoles, type AiStageOption } from "@/shared/domain/aiStages";
import { aiFlagOn } from "@/shared/domain/aiCrm";
import { aiNoteText } from "@/shared/domain/aiProposals";
import type { AiProposalPayload } from "@/shared/domain/aiProposals";
import type { StageMilestone } from "@/shared/domain/stageMilestones";
import { fromZonedTime, zonedDay } from "@/shared/domain/time";
import { parseStageOrder } from "@/shared/domain/stageOrder";

/** Что этап значит для модели — по роли и вехе этапа, а не по названию (этапы переименовывают). */
export function stageAbout(s: AiStageOption): string {
  const milestone = s.milestone ? `; сюда сделка идёт сама, когда «${stageMilestones[s.milestone as StageMilestone] ?? s.milestone}»` : "";
  switch (s.role) {
    case "entry":
      return "новая заявка: клиент написал, разговор ещё не начался";
    case "work":
      return "в работе: идёт разговор, клиент интересуется, задаёт вопросы, выбирает";
    case "silent":
      return "клиент не отвечает уже несколько дней (сказал «подумаю» и замолчал или просто пропал)";
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
  assigneeId: string | null;
  order: { id: string; number: number; status: string } | null;
  /** Последнее сообщение клиента: «не отвечает» — не раньше, чем он молчит silentDays дней. */
  lastIn: Date;
}

interface ReviewMessage {
  id?: string;
  direction: "in" | "out";
  text: string;
}

export interface AiStagesDeps {
  /** stages — «Двигает сделки по этапам», manager — «Определяет менеджера» (один разбор переписки на оба). */
  config(): Promise<{ stages: boolean; manager: boolean }>;
  /** Сотрудники, которые пишут с телефона магазина (активные), — модель называет одного из них. */
  staff(): Promise<{ id: string; name: string }[]>;
  aiReady(): Promise<boolean>;
  reviewedToday(): Promise<number>;
  /** Основная воронка: её этапы с ролями и причины отказа. */
  funnel(): Promise<{ pipelineId: string; stages: AiStageOption[]; silentDays: number } | null>;
  candidates(f: { pipelineId: string; limit: number }): Promise<Candidate[]>;
  markReviewed(dealId: string): Promise<void>;
  review(dealId: string, input: { stages: { n: number; name: string; about: string }[]; current: string; reasons: string[]; messages: number; staff: string[] }): Promise<{
    review: {
      stage: number | null;
      confidence: number;
      reason: string;
      quote: string;
      message: number | null;
      lostReason: string | null;
      delivered: { quote: string; message: number | null } | null;
      manager: { n: number; quote: string; message: number | null } | null;
    } | null;
    messages: ReviewMessage[];
  }>;
  move(dealId: string, stageId: string, lostReason: string | null, ai: { reason: string; quote: string | null; messageId: string | null }): Promise<void>;
  propose(p: { dealId: string; kind: "stage" | "order_status" | "assignee"; payload: AiProposalPayload; reason: string; quote: string | null; messageId: string | null; confidence: number }): Promise<boolean>;
  /** Назначить ответственного по выводу ИИ (с записью в ленту) и приписать ему наши сообщения с телефона магазина. */
  assign(dealId: string, staffId: string, note: string): Promise<void>;
  attribute(messageIds: string[], staffId: string): Promise<number>;
  logError(err: unknown): void;
}

export interface AiStagesResult {
  reviewed: number;
  applied: number;
  proposed: number;
  /** Назначен ответственный и сколько сообщений с телефона магазина ему приписано. */
  assigned: number;
  attributed: number;
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
export async function aiStagesPass(d: AiStagesDeps, now = new Date()): Promise<AiStagesResult | null> {
  const cfg = await d.config();
  if ((!cfg.stages && !cfg.manager) || !(await d.aiReady())) return null;
  const left = AI_STAGES.perDay - (await d.reviewedToday());
  if (left <= 0) return null;
  const funnel = await d.funnel();
  if (!funnel) return null;
  const list = funnel.stages.map((s, i) => ({ n: i + 1, name: s.name, about: stageAbout(s) }));
  const staff = cfg.manager ? await d.staff() : [];
  const result: AiStagesResult = { reviewed: 0, applied: 0, proposed: 0, assigned: 0, attributed: 0 };
  for (const c of await d.candidates({ pipelineId: funnel.pipelineId, limit: Math.min(AI_STAGES.batch, left) })) {
    const current = funnel.stages.find((s) => s.id === c.stageId);
    if (!current) continue;
    try {
      await d.markReviewed(c.id);
      const { review, messages } = await d.review(c.id, { stages: list, current: current.name, reasons: AI_REASONS, messages: AI_STAGES.messages, staff: staff.map((x) => x.name) });
      result.reviewed++;
      if (!review) continue;
      const target = review.stage ? (funnel.stages[review.stage - 1] ?? null) : null;
      const msg = review.message ? messages[review.message - 1] : undefined;
      // Отказ без названной причины — «Передумал», как у вывода «Порядка в воронке».
      const lostReason = target?.kind === "lost" ? (review.lostReason ?? AI_REASONS.find((r) => r === "Передумал") ?? null) : null;
      const silentFor = Math.floor((now.getTime() - c.lastIn.getTime()) / 86_400_000);
      const decision = aiStageDecision({ current, target, confidence: review.confidence, quoteOk: !!msg && quoteIn(review.quote, msg.text), quoteFromClient: msg?.direction === "in", lostReason, silentFor, silentDays: funnel.silentDays });
      const ai = { reason: review.reason || "по переписке", quote: review.quote || null, messageId: msg?.id ?? null };
      if (cfg.manager) await manager(d, c, review, messages, staff, result);
      if (!cfg.stages) continue;
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

/**
 * «Определяет менеджера»: сотрудник назван в переписке по имени — цитата с его именем в названном сообщении. Представился
 * сам — ответственный он (если другой — переназначаем, с записью в ленту), и ему приписываются наши сообщения с телефона
 * магазина от этого сообщения и дальше; назвал клиент — предложение назначить.
 */
async function manager(
  d: AiStagesDeps,
  c: Candidate,
  review: NonNullable<Awaited<ReturnType<AiStagesDeps["review"]>>["review"]>,
  messages: ReviewMessage[],
  staff: { id: string; name: string }[],
  result: AiStagesResult,
) {
  const m = review.manager;
  const who = m ? staff[m.n - 1] : undefined;
  const at = m?.message ? m.message - 1 : -1;
  const msg = at >= 0 ? messages[at] : undefined;
  if (!m || !who || !msg) return;
  const decision = aiManagerDecision({ staffId: who.id, assigneeId: c.assigneeId, quoteOk: quoteIn(m.quote, msg.text), nameOk: nameInText(who.name, m.quote), fromManager: msg.direction === "out" });
  if (decision === "propose") {
    if (await d.propose({ dealId: c.id, kind: "assignee", payload: { fromAssigneeId: c.assigneeId, staffId: who.id, staffName: who.name }, reason: "клиент обращается к сотруднику по имени", quote: m.quote, messageId: msg.id ?? null, confidence: review.confidence })) result.proposed++;
    return;
  }
  if (decision !== "apply") return;
  if (who.id !== c.assigneeId) {
    await d.assign(c.id, who.id, aiNoteText(`Ответственный — ${who.name}`, "сотрудник представился в переписке", m.quote));
    result.assigned++;
  }
  const ours = messages.slice(at).filter((x) => x.direction === "out" && x.id).map((x) => x.id!);
  result.attributed += await d.attribute(ours, who.id);
}

/** Порты из контекстов: настройки, продажи (воронка, этапы, предложения), отчёты (выборка), помощник (модель). */
export function aiStagesDeps(now = new Date()): AiStagesDeps {
  const c = container();
  return {
    config: async () => ({ stages: parseAiStages(await getSetting("crm.aiStages")).on, manager: aiFlagOn("crm.aiManager", await getSetting("crm.aiManager")) }),
    staff: async () => (await c.access.queries.allStaff()).filter((x) => !x.disabled && x.name.trim()).map((x) => ({ id: x.id, name: x.name.trim() })),
    assign: async (dealId, staffId, note) => {
      const deal = await c.sales.deals.assign(dealId, staffId);
      await c.sales.deals.note({ id: dealId, clientId: deal.clientId }, note, null);
    },
    attribute: (ids, staffId) => c.messaging.attributeShopMessages(ids, staffId),
    aiReady: () => c.assistant.service.configured(),
    reviewedToday: () => c.sales.aiProposals.reviewedSince(fromZonedTime(`${zonedDay(now)}T00:00`)),
    async funnel() {
      const [pipeline] = await c.sales.queries.listPipelines();
      if (!pipeline) return null;
      const stages = await c.sales.queries.listStages(pipeline.id);
      const order = await getSetting("crm.stageOrder");
      return { pipelineId: pipeline.id, stages: stageRoles(stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind, position: s.position, milestone: s.milestone ?? null })), order), silentDays: parseStageOrder(order).silentDays };
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
