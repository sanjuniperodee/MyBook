import "server-only";
import { sql } from "drizzle-orm";
import { executor } from "@/shared/infrastructure/database";

type Row = Record<string, unknown>;

export interface AiStageCandidate {
  id: string;
  number: number;
  stageId: string;
  assigneeId: string | null;
  /** Заказ сделки — для предложения «заказ выдан». */
  order: { id: string; number: number; status: string } | null;
  lastAt: Date;
  /** Последнее сообщение клиента. */
  lastIn: Date;
  /** Прошлый разбор ИИ: обещания берём только из сообщений после него (иначе задачи повторялись бы). */
  reviewedAt: Date | null;
}

/**
 * «ИИ ведёт этапы»: сделки воронки, в переписке которых есть новое после прошлого разбора, — затихшая (последнее сообщение
 * не новее quietMinutes) и свежая (не старше lookbackDays), с хотя бы одним сообщением клиента. Открытые; закрытые отказом
 * недавно (клиент вернулся); выигранные с заказом в печати или в пути (книгу выдали — предложить отметить). Свежие — первыми.
 */
export async function aiStageCandidates(f: { pipelineId: string; quietMinutes: number; lookbackDays: number; lostDays: number; limit: number; now: Date }): Promise<AiStageCandidate[]> {
  const quiet = new Date(f.now.getTime() - f.quietMinutes * 60_000);
  const since = new Date(f.now.getTime() - f.lookbackDays * 86_400_000);
  const lostSince = new Date(f.now.getTime() - f.lostDays * 86_400_000);
  const r = await executor().execute<Row>(sql`
    select d.id, d.number, d.stage_id, d.assignee_id, d.ai_stage_at, m.last_at, m.last_in, o.id as order_id, o.number as order_number, o.status as order_status
    from crm_deals d
    join crm_stages s on s.id = d.stage_id
    left join orders o on o.id = d.order_id
    join lateral (
      select max(x.created_at) as last_at, max(x.created_at) filter (where x.direction = 'in') as last_in
      from crm_messages x join crm_conversations cv on cv.id = x.conversation_id
      where cv.deal_id = d.id and x.internal = false and x.deleted_at is null
    ) m on m.last_at is not null
    where s.pipeline_id = ${f.pipelineId} and d.unsorted = false and m.last_in is not null
      and (s.kind = 'open' or (s.kind = 'lost' and d.closed_at >= ${lostSince}) or (s.kind = 'won' and o.status in ('in_production', 'shipped')))
      and m.last_at <= ${quiet} and m.last_at >= ${since}
      and (d.ai_stage_at is null or d.ai_stage_at < m.last_at)
    order by m.last_at desc
    limit ${f.limit}`);
  return r.rows.map((x) => ({
    id: String(x.id),
    number: Number(x.number),
    stageId: String(x.stage_id),
    assigneeId: x.assignee_id ? String(x.assignee_id) : null,
    order: x.order_id ? { id: String(x.order_id), number: Number(x.order_number), status: String(x.order_status) } : null,
    lastAt: x.last_at instanceof Date ? x.last_at : new Date(String(x.last_at)),
    lastIn: x.last_in instanceof Date ? x.last_in : new Date(String(x.last_in)),
    reviewedAt: x.ai_stage_at ? (x.ai_stage_at instanceof Date ? x.ai_stage_at : new Date(String(x.ai_stage_at))) : null,
  }));
}
