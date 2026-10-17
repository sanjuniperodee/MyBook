import "server-only";
import { and, desc, eq, gte, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { crmDeals, crmSavedViews, crmStages } from "@/shared/infrastructure/db/schema";
import { dealSources, type DealSource } from "@/shared/domain/dealSources";
import { crmDealsClientId, crmDealsId } from "@/shared/infrastructure/db/refs";
import { answeredSql, totalSql, wordsSql } from "@/shared/infrastructure/db/bookProgress";
import { executor } from "@/shared/infrastructure/database";
import { visibleTo, type Viewer } from "./MyDay";

const CLOSED_DAYS = 30;

/**
 * Список и доска сделок воронки с фильтрами: ответственный, источник, свои поля-списки, задачи,
 * «застряла на этапе», поиск. Видимость «только свои».
 */
export async function dealList(
  viewer: Viewer,
  pipeline: { id: string },
  sp: Record<string, string | undefined>,
  selectFields: { key: string; options: string[] }[],
  view: "board" | "list",
) {
  const db = executor();
  const w: SQL[] = [eq(crmStages.pipelineId, pipeline.id)];
  const scope = visibleTo(viewer, crmDeals.assigneeId);
  if (scope) w.push(scope);
  if (sp.mine === "1") w.push(eq(crmDeals.assigneeId, viewer.userId));
  else if (sp.a === "none") w.push(isNull(crmDeals.assigneeId));
  else if (sp.a && /^[0-9a-f-]{36}$/.test(sp.a)) w.push(eq(crmDeals.assigneeId, sp.a));
  if (sp.src && (dealSources as readonly string[]).includes(sp.src)) w.push(eq(crmDeals.source, sp.src as DealSource));
  // Фильтры по своим полям-спискам: ?cf_occasion=Свадьба
  for (const f of selectFields) {
    const v = sp[`cf_${f.key}`];
    if (v && f.options.includes(v)) w.push(sql`${crmDeals.customFields}->>${f.key} = ${v}`);
  }
  // Быстрые фильтры: без задачи, просроченная задача, застряла на этапе.
  if (sp.task === "none") w.push(sql`not exists (select 1 from crm_tasks t where t.deal_id = ${crmDealsId} and t.done_at is null)`);
  if (sp.task === "overdue") w.push(sql`exists (select 1 from crm_tasks t where t.deal_id = ${crmDealsId} and t.done_at is null and t.due_at < now())`);
  const stale = Number(sp.stale);
  if (stale > 0) w.push(sql`${crmDeals.stageChangedAt} < now() - make_interval(days => ${Math.min(stale, 365)})`, eq(crmStages.kind, "open"));
  const q = sp.q?.trim();
  if (q) {
    const like = `%${q}%`;
    const digits = q.replace(/\D/g, "");
    w.push(
      or(
        ilike(crmDeals.title, like),
        ilike(crmDeals.contactName, like),
        digits.length >= 4 ? sql`regexp_replace(coalesce(${crmDeals.contactPhone}, ''), '\\D', '', 'g') like ${"%" + digits + "%"}` : undefined,
        /^\d{1,7}$/.test(q) ? eq(crmDeals.number, Number(q)) : undefined,
      )!,
    );
  }
  // На доске закрытые сделки — только за последние 30 дней, чтобы колонки «успех/отказ» не разрастались.
  if (view === "board") w.push(or(eq(crmStages.kind, "open"), gte(crmDeals.closedAt, sql`now() - interval '${sql.raw(String(CLOSED_DAYS))} days'`))!);

  return db
      .select({
        deal: crmDeals,
        stageKind: crmStages.kind,
        nextTask: sql<Date | null>`(select min(t.due_at) from crm_tasks t where t.deal_id = ${crmDealsId} and t.done_at is null)`,
        // Принятые деньги по сделке (платежи менеджеров): на карточке видно, сколько уже получено.
        paid: sql<number>`coalesce((select sum(case when p.kind = 'refund' then -p.amount else p.amount end) from crm_payments p where p.deal_id = ${crmDealsId}), 0)::int`,
        unread: sql<number>`coalesce((select sum(c.unread) from crm_conversations c where c.deal_id = ${crmDealsId}), 0)::int`,
        // Прогресс последней книги клиента: вид книги, ответы (разделы с текстом) и слова — progressOf считает по ним.
        book: sql<{ theme: string; answered: number; total: number; words: number } | null>`(
          select json_build_object('theme', b.theme, 'answered', ${answeredSql(sql`b.id`)}, 'total', ${totalSql(sql`b.id`)}, 'words', ${wordsSql(sql`b.id`)})
          from books b where b.user_id = ${crmDealsClientId} and exists (select 1 from book_questions q0 where q0.book_id = b.id)
          order by b.updated_at desc limit 1)`,
      })
      .from(crmDeals)
      .innerJoin(crmStages, eq(crmStages.id, crmDeals.stageId))
      .where(w.length ? and(...w) : undefined)
      .orderBy(view === "board" ? desc(crmDeals.stageChangedAt) : desc(crmDeals.createdAt))
      .limit(view === "board" ? 1000 : 300);
}

/** Сохранённые фильтры сделок: мои и общие. */
export function savedViews(userId: string) {
  return executor()
      .select()
      .from(crmSavedViews)
      .where(and(eq(crmSavedViews.entity, "deals"), or(eq(crmSavedViews.userId, userId), eq(crmSavedViews.shared, true))))
      .orderBy(crmSavedViews.createdAt);
}

/** Сколько сделок на каждом этапе (настройка воронки). */
export function stageCounts() {
  return executor().select({ stageId: crmDeals.stageId, n: sql<number>`count(*)::int` }).from(crmDeals).groupBy(crmDeals.stageId);
}
