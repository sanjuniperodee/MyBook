import { crmDealsClientId, crmDealsId } from "@/lib/db/refs";
import Link from "next/link";
import { and, desc, eq, gte, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { Plus, Settings2 } from "lucide-react";
import { db } from "@/lib/db";
import { crmDeals, crmStages, dealSources, type DealSource } from "@/lib/db/schema";
import { can, canAssignOthers, ownScope, requireStaff } from "@/lib/crm/rbac";
import { adminLabel, listAdmins, staffOptions } from "@/lib/crm";
import { dealSourceLabels, listStages } from "@/lib/crm/deals";
import { formatPrice } from "@/config/site";
import { cn, formatDate, nowMs } from "@/lib/utils";
import { DealsBoard, type DealCard } from "./DealsBoard";

export const metadata = { title: "Сделки" };

const CLOSED_DAYS = 30;

export default async function DealsPage({ searchParams }: { searchParams: Promise<{ mine?: string; a?: string; src?: string; q?: string; view?: string }> }) {
  const staff = await requireStaff("deals.view");
  const sp = await searchParams;
  const view = sp.view === "list" ? "list" : "board";
  const w: SQL[] = [];
  const scope = ownScope(staff, crmDeals.assigneeId);
  if (scope) w.push(scope);
  if (sp.mine === "1") w.push(eq(crmDeals.assigneeId, staff.user.id));
  else if (sp.a === "none") w.push(isNull(crmDeals.assigneeId));
  else if (sp.a && /^[0-9a-f-]{36}$/.test(sp.a)) w.push(eq(crmDeals.assigneeId, sp.a));
  if (sp.src && (dealSources as readonly string[]).includes(sp.src)) w.push(eq(crmDeals.source, sp.src as DealSource));
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

  const [stages, rows, admins] = await Promise.all([
    listStages(),
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
    source: dealSourceLabels[deal.source],
    assigneeId: deal.assigneeId,
    assigneeLabel: deal.assigneeId ? (names.get(deal.assigneeId) ?? null) : null,
    daysInStage: Math.floor((now - deal.stageChangedAt.getTime()) / 86_400_000),
    task: nextTask ? { overdue: new Date(nextTask).getTime() < now, label: formatDate(new Date(nextTask)) } : null,
    unread,
    tags: deal.tags,
    unsorted: deal.unsorted,
    book,
  }));

  const params = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    const s = p.toString();
    return s ? `/admin/deals?${s}` : "/admin/deals";
  };
  const chip = (active: boolean) => cn("rounded-full px-3 py-1.5 text-sm", active ? "bg-ink text-white" : "bg-white text-ink-soft hover:bg-cream");
  const openSum = rows.filter((r) => r.stageKind === "open").reduce((s, r) => s + r.deal.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Сделки</h1>
        <span className="text-sm text-muted">
          в работе {rows.filter((r) => r.stageKind === "open").length} · {formatPrice(openSum)}
        </span>
        <div className="ml-auto flex gap-2">
          {can(staff, "settings.manage") ? (
            <Link href="/admin/deals/stages" className="btn btn-ghost btn-sm">
              <Settings2 className="size-4" /> Этапы
            </Link>
          ) : null}
          {can(staff, "deals.edit") ? (
            <Link href="/admin/deals/new" className="btn btn-sm">
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
          {sp.mine ? <input type="hidden" name="mine" value={sp.mine} /> : null}
          {sp.a ? <input type="hidden" name="a" value={sp.a} /> : null}
          {view === "list" ? <input type="hidden" name="view" value="list" /> : null}
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

      {view === "board" ? (
        <DealsBoard stages={stages.map((s) => ({ id: s.id, name: s.name, color: s.color, kind: s.kind }))} initial={cards} canEdit={can(staff, "deals.edit")} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-line text-left text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">№</th>
                <th className="px-4 py-3 font-medium">Сделка</th>
                <th className="px-4 py-3 font-medium">Этап</th>
                <th className="px-4 py-3 font-medium">Источник</th>
                <th className="px-4 py-3 font-medium">Ответственный</th>
                <th className="px-4 py-3 text-right font-medium">Бюджет</th>
                <th className="px-4 py-3 font-medium">Создана</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map(({ deal }) => {
                const st = stages.find((s) => s.id === deal.stageId);
                return (
                  <tr key={deal.id} className="hover:bg-cream/40">
                    <td className="px-4 py-2.5 font-medium">
                      <Link href={`/admin/deals/${deal.id}`} className="hover:text-wine">
                        {deal.number}
                      </Link>
                    </td>
                    <td className="max-w-72 truncate px-4 py-2.5">
                      <Link href={`/admin/deals/${deal.id}`} className="hover:text-wine">
                        {deal.title}
                      </Link>
                      {deal.contactName ? <span className="text-muted"> · {deal.contactName}</span> : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-full px-2 py-0.5 text-xs text-white" style={{ background: st?.color }}>
                        {st?.name}
                      </span>
                      {deal.lostReason ? <span className="ml-1 text-xs text-muted">{deal.lostReason}</span> : null}
                    </td>
                    <td className="px-4 py-2.5 text-muted">{dealSourceLabels[deal.source]}</td>
                    <td className="px-4 py-2.5">{deal.assigneeId ? names.get(deal.assigneeId) : <span className="text-muted">—</span>}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{deal.amount ? formatPrice(deal.amount) : "—"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted">{formatDate(deal.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="p-6 text-center text-sm text-muted">Сделок не найдено.</p> : null}
        </div>
      )}
    </div>
  );
}
