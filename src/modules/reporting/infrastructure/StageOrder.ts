import "server-only";
import { sql } from "drizzle-orm";
import { executor } from "@/shared/infrastructure/database";
import type { StageOrderDeal } from "@/shared/domain/stageOrder";

type Row = Record<string, unknown>;
const date = (v: unknown) => (v === null || v === undefined ? null : v instanceof Date ? v : new Date(String(v)));
const ids = (list: string[]) => sql.join(list.map((id) => sql`${id}`), sql`, `);

export interface StageOrderCandidate extends StageOrderDeal {
  id: string;
  number: number;
  clientId: string | null;
}

/**
 * «Порядок в воронке»: заявки воронки на этапах stageIds — с перепиской, без денег, заказа и «неразобранных», — и когда
 * в их чатах последний раз писал клиент и мы. Наш ответ — человек или бот; заметки и сообщения правил ответом не считаются.
 * Свежие по последнему сообщению клиента — первыми.
 */
export async function stageOrderCandidates(f: { pipelineId: string; stageIds: string[]; entryStageId: string }): Promise<StageOrderCandidate[]> {
  if (!f.stageIds.length) return [];
  const r = await executor().execute<Row>(sql`
    select d.id, d.number, d.client_id, d.stage_id, d.created_at, d.stage_changed_at, m.last_in, m.last_out,
      exists (select 1 from crm_tasks t where t.deal_id = d.id and t.done_at is null) as has_task
    from crm_deals d
    join crm_stages s on s.id = d.stage_id
    join lateral (
      select max(x.created_at) filter (where x.direction = 'in') as last_in,
        max(x.created_at) filter (where x.direction = 'out' and coalesce(x.source, '') <> 'rule') as last_out,
        count(*) as n
      from crm_messages x join crm_conversations cv on cv.id = x.conversation_id
      where cv.deal_id = d.id and x.internal = false
    ) m on m.n > 0
    where s.pipeline_id = ${f.pipelineId} and d.stage_id in (${ids(f.stageIds)})
      and d.unsorted = false and d.order_id is null
      and not exists (select 1 from crm_payments p where p.deal_id = d.id)
    order by coalesce(m.last_in, d.created_at) desc`);
  return r.rows.map((x) => ({
    id: String(x.id),
    number: Number(x.number),
    clientId: x.client_id === null || x.client_id === undefined ? null : String(x.client_id),
    stageId: String(x.stage_id),
    onEntryStage: String(x.stage_id) === f.entryStageId,
    createdAt: date(x.created_at)!,
    stageChangedAt: date(x.stage_changed_at)!,
    lastIn: date(x.last_in),
    lastOut: date(x.last_out),
    hasOpenTask: x.has_task === true,
  }));
}

/** Сделки воронки на этапах stageIds, по которым пришли деньги (возвраты вычтены), а заказа ещё нет. */
export async function stageOrderPaid(f: { pipelineId: string; stageIds: string[] }): Promise<{ id: string; clientId: string | null; paid: number }[]> {
  if (!f.stageIds.length) return [];
  const r = await executor().execute<Row>(sql`
    select d.id, d.client_id, p.paid
    from crm_deals d
    join crm_stages s on s.id = d.stage_id
    join lateral (select coalesce(sum(case when x.kind = 'refund' then -x.amount else x.amount end), 0)::int as paid from crm_payments x where x.deal_id = d.id) p on p.paid > 0
    where s.pipeline_id = ${f.pipelineId} and d.stage_id in (${ids(f.stageIds)}) and d.order_id is null`);
  return r.rows.map((x) => ({ id: String(x.id), clientId: x.client_id === null || x.client_id === undefined ? null : String(x.client_id), paid: Number(x.paid) }));
}
