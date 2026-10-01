import { crmDealsClientId, crmDealsId } from "@/lib/db/refs";
import { listFields } from "@/lib/crm/fields";
import { channelLabel, toAttribution } from "@/lib/crm/channels";
import Link from "next/link";
import { and, desc, eq, gte, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { Plus, Settings2 } from "lucide-react";
import { db } from "@/lib/db";
import { crmDeals, crmSavedViews, crmStages, dealSources, type DealSource } from "@/lib/db/schema";
import { can, canAssignOthers, ownScope, requireStaff } from "@/server/access";
import { adminLabel, listAdmins, staffOptions } from "@/lib/crm";
import { dealSourceLabels, listPipelines, listStages } from "@/lib/crm/deals";
import { formatPrice } from "@/config/site";
import { cn, formatDate, nowMs } from "@/lib/utils";
import { DealsBoard, type DealCard } from "./DealsBoard";
import { DealsTable, SavedViews } from "./DealsTable";

export const metadata = { title: "Сделки" };

const CLOSED_DAYS = 30;

export default async function DealsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined> & { mine?: string; a?: string; src?: string; q?: string; view?: string; p?: string }> }) {
  const staff = await requireStaff("deals.view");
  const sp = await searchParams;
  const pipelines = await listPipelines();
  const pipeline = pipelines.find((x) => x.id === sp.p) ?? pipelines[0];
  const selectFields = (await listFields("deal")).filter((f) => f.type === "select");
  const view = sp.view === "list" ? "list" : "board";
  const w: SQL[] = [eq(crmStages.pipelineId, pipeline.id)];
  const scope = ownScope(staff, crmDeals.assigneeId);
  if (scope) w.push(scope);
  if (sp.mine === "1") w.push(eq(crmDeals.assigneeId, staff.user.id));
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

  const [stages, rows, admins, views] = await Promise.all([
    listStages(pipeline.id),
    db
      .select({
        deal: crmDeals,
        stageKind: crmStages.kind,
        nextTask: sql<Date | null>`(select min(t.due_at) from crm_tasks t where t.deal_id = ${crmDealsId} and t.done_at is null)`,
        unread: sql<number>`coalesce((select sum(c.unread) from crm_conversations c where c.deal_id = ${crmDealsId}), 0)::int`,
        // Прогресс лучшей книги клиента: сколько вопросов с ответом из скольких.
        book: sql<{ answered: number; total: number } | null>`(
          select json_build_object('answered', count(*) filter (where length(trim(q.answer)) > 0), 'total', count(*))
          from book_questions q where q.book_id = (select b.id from books b where b.user_id = ${crmDealsClientId} order by b.updated_at desc limit 1)
          having count(*) > 0)`,
      })
      .from(crmDeals)
      .innerJoin(crmStages, eq(crmStages.id, crmDeals.stageId))
      .where(w.length ? and(...w) : undefined)
      .orderBy(view === "board" ? desc(crmDeals.stageChangedAt) : desc(crmDeals.createdAt))
      .limit(view === "board" ? 1000 : 300),
    listAdmins(),
    db
      .select()
      .from(crmSavedViews)
      .where(and(eq(crmSavedViews.entity, "deals"), or(eq(crmSavedViews.userId, staff.user.id), eq(crmSavedViews.shared, true))))
      .orderBy(crmSavedViews.createdAt),
  ]);
  const names = new Map(admins.map((a) => [a.id, adminLabel(a)]));
  const now = nowMs();
  const cards: DealCard[] = rows.map(({ deal, nextTask, unread, book }) => ({
    id: deal.id,
    number: deal.number,
    title: deal.title,
    contactName: deal.contactName,
    stageId: deal.stageId,
    amount: deal.amount,
    source: deal.utm ? channelLabel(toAttribution(deal.utm), deal.source) : dealSourceLabels[deal.source],
    assigneeId: deal.assigneeId,
    assigneeLabel: deal.assigneeId ? (names.get(deal.assigneeId) ?? null) : null,
    daysInStage: Math.floor((now - deal.stageChangedAt.getTime()) / 86_400_000),
    task: nextTask ? { overdue: new Date(nextTask).getTime() < now, label: formatDate(new Date(nextTask)) } : null,
    unread,
    tags: deal.tags,
    unsorted: deal.unsorted,
    book,
    eventDate: typeof deal.customFields.event_date === "string" ? deal.customFields.event_date : null,
  }));

  const params = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    const s = p.toString();
    return s ? `/admin/deals?${s}` : "/admin/deals";
  };
  const currentQuery = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && /^(mine|a|src|q|view|p|task|stale|cf_[a-z0-9_]+)$/.test(k)) as [string, string][]).toString();
  const chip = (active: boolean) => cn("rounded-full px-3 py-1.5 text-sm", active ? "bg-ink text-white" : "bg-white text-ink-soft hover:bg-cream");
  const openSum = rows.filter((r) => r.stageKind === "open").reduce((s, r) => s + r.deal.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Сделки</h1>
        {pipelines.length > 1 ? (
          <div className="flex rounded-xl border border-line bg-white p-0.5 text-sm" data-testid="pipelines">
            {pipelines.map((x) => (
              <Link key={x.id} href={x.id === pipelines[0].id ? "/admin/deals" : `/admin/deals?p=${x.id}`} className={cn("rounded-lg px-3 py-1", x.id === pipeline.id ? "bg-ink text-white" : "text-ink-soft hover:bg-cream")}>
                {x.name}
              </Link>
            ))}
          </div>
        ) : null}
        <span className="text-sm text-muted">
          в работе {rows.filter((r) => r.stageKind === "open").length} · {formatPrice(openSum)}
        </span>
        <div className="ml-auto flex gap-2">
          {can(staff, "settings.manage") ? (
            <Link href="/admin/deals/fields" className="btn btn-ghost btn-sm">
              Поля
            </Link>
          ) : null}
          {can(staff, "settings.manage") ? (
            <Link href={`/admin/deals/stages?p=${pipeline.id}`} className="btn btn-ghost btn-sm">
              <Settings2 className="size-4" /> Этапы
            </Link>
          ) : null}
          {can(staff, "deals.edit") ? (
            <Link href={`/admin/deals/new?p=${pipeline.id}`} className="btn btn-sm">
              <Plus className="size-4" /> Новая сделка
            </Link>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {can(staff, "deals.edit") ? (
          <Link href="/admin/deals/duplicates" className="text-sm text-muted hover:text-wine">
            Дубли
          </Link>
        ) : null}
        <Link href={params({ mine: undefined, a: undefined })} className={chip(!sp.mine && !sp.a)}>
          Все
        </Link>
        <Link href={params({ mine: "1", a: undefined })} className={chip(sp.mine === "1")}>
          Мои
        </Link>
        <Link href={params({ mine: undefined, a: "none" })} className={chip(sp.a === "none")}>
          Неразобранные
        </Link>
        {canAssignOthers(staff)
          ? staffOptions(admins)
              .filter((a) => a.id !== staff.user.id)
              .map((a) => (
                <Link key={a.id} href={params({ mine: undefined, a: a.id })} className={chip(sp.a === a.id)}>
                  {a.label}
                </Link>
              ))
          : null}
        <form className="ml-auto flex items-center gap-2" action="/admin/deals">
          {sp.p ? <input type="hidden" name="p" value={sp.p} /> : null}
          {sp.mine ? <input type="hidden" name="mine" value={sp.mine} /> : null}
          {sp.a ? <input type="hidden" name="a" value={sp.a} /> : null}
          {view === "list" ? <input type="hidden" name="view" value="list" /> : null}
          {selectFields.map((f) => (
            <select key={f.key} name={`cf_${f.key}`} defaultValue={sp[`cf_${f.key}`] ?? ""} className="input h-9 max-w-40 text-sm" aria-label={f.label}>
              <option value="">{f.label}: все</option>
              {f.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ))}
          <select name="src" defaultValue={sp.src ?? ""} className="input h-9 text-sm" aria-label="Источник">
            <option value="">Все источники</option>
            {dealSources.map((s) => (
              <option key={s} value={s}>
                {dealSourceLabels[s]}
              </option>
            ))}
          </select>
          <input name="q" defaultValue={q} placeholder="Имя, телефон, №" className="input h-9 w-44 text-sm" />
          <button className="btn btn-outline btn-sm h-9">Найти</button>
        </form>
        <div className="flex rounded-xl border border-line bg-white p-0.5 text-sm">
          <Link href={params({ view: undefined })} className={cn("rounded-lg px-3 py-1", view === "board" ? "bg-ink text-white" : "text-ink-soft")}>
            Воронка
          </Link>
          <Link href={params({ view: "list" })} className={cn("rounded-lg px-3 py-1", view === "list" ? "bg-ink text-white" : "text-ink-soft")}>
            Список
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs text-muted">Быстрые:</span>
        {(
          [
            ["task", "none", "Без задачи"],
            ["task", "overdue", "Просрочена задача"],
            ["stale", "7", "Стоят на этапе > 7 дней"],
          ] as const
        ).map(([k, v, label]) => (
          <Link key={k + v} href={params({ [k]: sp[k] === v ? undefined : v })} className={cn("rounded-full border px-3 py-1", sp[k] === v ? "border-wine bg-rose/40 text-wine" : "border-line bg-white text-ink-soft hover:bg-cream")}>
            {label}
          </Link>
        ))}
        <span className="mx-1 h-4 w-px bg-line" />
        <SavedViews
          views={views.map((v) => ({ id: v.id, name: v.name, query: v.query, mine: v.userId === staff.user.id, shared: v.shared }))}
          query={currentQuery}
          canShare={canAssignOthers(staff)}
        />
      </div>

      {view === "board" ? (
        <DealsBoard stages={stages.map((s) => ({ id: s.id, name: s.name, color: s.color, kind: s.kind }))} initial={cards} canEdit={can(staff, "deals.edit")} />
      ) : (
        <DealsTable
          rows={rows.map(({ deal }) => {
            const st = stages.find((x) => x.id === deal.stageId);
            return {
              id: deal.id,
              number: deal.number,
              title: deal.title,
              contactName: deal.contactName,
              stage: { name: st?.name ?? "—", color: st?.color ?? "#999" },
              lostReason: deal.lostReason,
              channel: channelLabel(toAttribution(deal.utm), deal.source),
              campaign: deal.utm?.campaign ?? null,
              assignee: deal.assigneeId ? (names.get(deal.assigneeId) ?? null) : null,
              amount: deal.amount ? formatPrice(deal.amount) : "—",
              created: formatDate(deal.createdAt),
            };
          })}
          stages={stages.map((x) => ({ id: x.id, name: x.name, kind: x.kind }))}
          staff={canAssignOthers(staff) ? staffOptions(admins) : staffOptions(admins).filter((a) => a.id === staff.user.id)}
          canEdit={can(staff, "deals.edit")}
          canDelete={can(staff, "deals.delete")}
        />
      )}
    </div>
  );
}
