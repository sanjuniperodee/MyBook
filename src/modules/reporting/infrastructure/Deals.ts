import "server-only";
import { extraPhoneMatch, phoneMatch, tagMatch } from "./phoneSearch";
import { and, desc, eq, gte, ilike, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { crmDeals, crmSavedViews, crmStages } from "@/shared/infrastructure/db/schema";
import { dealSources, type DealSource } from "@/shared/domain/dealSources";
import { crmDealsClientId, crmDealsId } from "@/shared/infrastructure/db/refs";
import { answeredSql, totalSql, wordsSql } from "@/shared/infrastructure/db/bookProgress";
import { executor } from "@/shared/infrastructure/database";
import { visibleTo, type Viewer } from "./MyDay";
import { noOpenTask } from "./conditions";
import { storeTimeZone } from "@/shared/domain/time";
import { dealAdvancedFilters } from "../ui/dealFilters";
import { managerListKey } from "../ui/managerLists";
import { managerListWhere } from "./ManagerLists";

const CLOSED_DAYS = 30;

type DealParams = Record<string, string | undefined>;
type SelectFields = { key: string; options: string[] }[];

/** Условия выборки сделок воронки — общие для списка, доски и итогов в шапке (dealTotals). */
function dealWhere(viewer: Viewer, pipeline: { id: string }, sp: DealParams, selectFields: SelectFields, view: "board" | "list"): SQL[] {
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
  // Быстрые фильтры: без задачи (открытые сделки без следующего шага — как плитка «Моего дня»), просроченная задача,
  // застряла на этапе.
  if (sp.task === "none") w.push(noOpenTask(), eq(crmStages.kind, "open"));
  if (sp.task === "overdue") w.push(sql`exists (select 1 from crm_tasks t where t.deal_id = ${crmDealsId} and t.done_at is null and t.due_at < now() and (t.board_id is null or t.board_id in (select b.id from crm_boards b where b.is_default)))`);
  // Списки для менеджеров (отчёт 15.11): «остановились на оплате», «книга почти готова, заказа нет» и т. д.
  const list = managerListKey(sp.list);
  if (list) w.push(managerListWhere(list), eq(crmStages.kind, "open"));
  const stale = Number(sp.stale);
  if (stale > 0) w.push(sql`${crmDeals.stageChangedAt} < now() - make_interval(days => ${Math.min(stale, 365)})`, eq(crmStages.kind, "open"));
  // Панель «Фильтр»: дата (создания, закрытия или смены этапа), этап, бюджет, оплата, причина отказа, тег.
  const f = dealAdvancedFilters(sp, storeTimeZone());
  const dateCol = f.field === "closed" ? crmDeals.closedAt : f.field === "stage" ? crmDeals.stageChangedAt : crmDeals.createdAt;
  if (f.from) w.push(gte(dateCol, f.from));
  if (f.to) w.push(lt(dateCol, f.to));
  if (f.stageId) w.push(eq(crmDeals.stageId, f.stageId));
  if (f.min !== null) w.push(gte(crmDeals.amount, f.min));
  if (f.max !== null) w.push(lte(crmDeals.amount, f.max));
  const paidSum = sql`coalesce((select sum(case when p.kind = 'refund' then -p.amount else p.amount end) from crm_payments p where p.deal_id = ${crmDealsId}), 0)`;
  if (f.paid === "yes") w.push(sql`${paidSum} > 0`);
  if (f.paid === "no") w.push(sql`${paidSum} <= 0`);
  if (f.lostReason) w.push(eq(crmDeals.lostReason, f.lostReason), eq(crmStages.kind, "lost"));
  if (f.tag) w.push(sql`exists (select 1 from unnest(${crmDeals.tags}) t where lower(t) = lower(${f.tag}))`);
  const q = sp.q?.trim();
  if (q) {
    const like = `%${q}%`;
    w.push(
      or(
        ilike(crmDeals.title, like),
        ilike(crmDeals.contactName, like),
        ilike(crmDeals.contactEmail, like),
        phoneMatch(crmDeals.contactPhone, q),
        extraPhoneMatch(crmDeals.extraPhones, q),
        tagMatch(crmDeals.tags, q),
        /^\d{1,7}$/.test(q) ? eq(crmDeals.number, Number(q)) : undefined,
      )!,
    );
  }
  // На доске закрытые сделки — только за последние 30 дней, чтобы колонки «успех/отказ» не разрастались. Задан период
  // или причина отказа — человек ищет конкретные закрытые сделки, окно не действует.
  if (view === "board" && !f.from && !f.to && !f.lostReason) w.push(or(eq(crmStages.kind, "open"), gte(crmDeals.closedAt, sql`now() - interval '${sql.raw(String(CLOSED_DAYS))} days'`))!);
  return w;
}

/**
 * Список и доска сделок воронки с фильтрами: ответственный, источник, свои поля-списки, задачи,
 * «застряла на этапе», поиск и панель «Фильтр» (дата, этап, бюджет, оплата, причина отказа, тег). Видимость «только свои». page — страница списка (limit/offset); без неё — первые 300
 * (доска — 1000).
 */
export async function dealList(viewer: Viewer, pipeline: { id: string }, sp: DealParams, selectFields: SelectFields, view: "board" | "list", page?: { limit: number; offset: number }) {
  const db = executor();
  const w = dealWhere(viewer, pipeline, sp, selectFields, view);
  return db
      .select({
        deal: crmDeals,
        stageKind: crmStages.kind,
        nextTask: sql<Date | null>`(select min(t.due_at) from crm_tasks t where t.deal_id = ${crmDealsId} and t.done_at is null and (t.board_id is null or t.board_id in (select b.id from crm_boards b where b.is_default)))`,
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
      .where(and(...w))
      .orderBy(view === "board" ? desc(crmDeals.stageChangedAt) : desc(crmDeals.createdAt))
      .limit(page?.limit ?? (view === "board" ? 1000 : 300))
      .offset(page?.offset ?? 0);
}

/**
 * Итоги по тем же фильтрам — для шапки и страниц списка, без обрезки страницей: всего сделок, из них «в работе»
 * (этап «открыт») и их бюджет.
 */
export async function dealTotals(viewer: Viewer, pipeline: { id: string }, sp: DealParams, selectFields: SelectFields, view: "board" | "list") {
  const [row] = await executor()
    .select({
      total: sql<number>`count(*)::int`,
      open: sql<number>`(count(*) filter (where ${crmStages.kind} = 'open'))::int`,
      openSum: sql<number>`coalesce(sum(${crmDeals.amount}) filter (where ${crmStages.kind} = 'open'), 0)::int`,
    })
    .from(crmDeals)
    .innerJoin(crmStages, eq(crmStages.id, crmDeals.stageId))
    .where(and(...dealWhere(viewer, pipeline, sp, selectFields, view)));
  return row ?? { total: 0, open: 0, openSum: 0 };
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
