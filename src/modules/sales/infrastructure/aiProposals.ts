import "server-only";
import { and, count, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { crmAiProposals, crmDeals } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import type { AiFieldPayload, AiProposalKind, AiProposalPayload, AiProposalStatus, AiProposalView } from "@/shared/domain/aiProposals";

export interface NewAiProposal {
  dealId: string;
  kind: AiProposalKind;
  payload: AiProposalPayload;
  reason: string;
  quote: string | null;
  messageId: string | null;
  confidence: number;
}

const view = (r: typeof crmAiProposals.$inferSelect): AiProposalView => ({ id: r.id, kind: r.kind, payload: r.payload, reason: r.reason, quote: r.quote, messageId: r.messageId, confidence: r.confidence, status: r.status, createdAt: r.createdAt });

/** Одинаковые ли по смыслу предложения (тот же этап и причина, тот же заказ и статус) — второе не заводим. */
const sameTarget = (a: AiProposalPayload, b: AiProposalPayload) => JSON.stringify({ ...a, fromStageId: undefined, fromStatus: undefined }) === JSON.stringify({ ...b, fromStageId: undefined, fromStatus: undefined });

/**
 * Предложения ИИ по сделкам (crm_ai_proposals) и отметка «ИИ читал переписку» (crm_deals.ai_stage_at). Новое предложение
 * того же вида заменяет старое ждущее (оно устаревает), одинаковое второй раз не заводится.
 */
export class DealAiProposals {
  async pending(dealId: string): Promise<AiProposalView[]> {
    const rows = await executor().select().from(crmAiProposals).where(and(eq(crmAiProposals.dealId, dealId), eq(crmAiProposals.status, "pending"))).orderBy(desc(crmAiProposals.createdAt)).limit(10);
    return rows.map(view);
  }

  async find(id: string): Promise<(AiProposalView & { dealId: string }) | null> {
    const [r] = await executor().select().from(crmAiProposals).where(eq(crmAiProposals.id, id)).limit(1);
    return r ? { ...view(r), dealId: r.dealId } : null;
  }

  /** Завести предложение; false — такое уже ждёт решения. */
  async add(p: NewAiProposal): Promise<boolean> {
    const db = executor();
    // Одно ждущее предложение на «место»: этап, ответственного, заказ — по виду; поле — по виду и ключу поля.
    const slot = (x: AiProposalPayload) => (p.kind === "field" ? (x as AiFieldPayload).key : "");
    const waiting = (await db.select().from(crmAiProposals).where(and(eq(crmAiProposals.dealId, p.dealId), eq(crmAiProposals.kind, p.kind), eq(crmAiProposals.status, "pending")))).filter((w) => slot(w.payload) === slot(p.payload));
    if (waiting.some((w) => sameTarget(w.payload, p.payload))) return false;
    if (waiting.length) await db.update(crmAiProposals).set({ status: "stale", decidedAt: new Date() }).where(inArray(crmAiProposals.id, waiting.map((w) => w.id)));
    await db.insert(crmAiProposals).values({ dealId: p.dealId, kind: p.kind, payload: p.payload, reason: p.reason.slice(0, 300), quote: p.quote?.slice(0, 300) || null, messageId: p.messageId, confidence: p.confidence });
    return true;
  }

  /** Решение по предложению: применили, отклонили или оно устарело. false — уже решено раньше. */
  async decide(id: string, status: Exclude<AiProposalStatus, "pending">, actorId: string | null): Promise<boolean> {
    const rows = await executor()
      .update(crmAiProposals)
      .set({ status, decidedById: actorId, decidedAt: new Date() })
      .where(and(eq(crmAiProposals.id, id), eq(crmAiProposals.status, "pending")))
      .returning({ id: crmAiProposals.id });
    return rows.length > 0;
  }

  /** Сделку перевели по-другому — её ждущие предложения этапа устаревают. */
  async staleStage(dealId: string, exceptId?: string) {
    await executor()
      .update(crmAiProposals)
      .set({ status: "stale", decidedAt: new Date() })
      .where(and(eq(crmAiProposals.dealId, dealId), eq(crmAiProposals.kind, "stage"), eq(crmAiProposals.status, "pending"), ...(exceptId ? [ne(crmAiProposals.id, exceptId)] : [])));
  }

  async markReviewed(dealId: string, at: Date) {
    await executor().update(crmDeals).set({ aiStageAt: at }).where(eq(crmDeals.id, dealId));
  }

  /** Сколько сделок ИИ разобрал с этого момента (лимит в сутки). */
  async reviewedSince(since: Date): Promise<number> {
    const [r] = await executor().select({ n: count() }).from(crmDeals).where(gte(crmDeals.aiStageAt, since));
    return Number(r?.n ?? 0);
  }
}
