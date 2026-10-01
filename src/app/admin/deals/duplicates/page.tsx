import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { canSeeAssigned, contactView, requireStaff } from "@/server/access";
import { formatPhone } from "@/lib/crm/phone";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Дубли сделок" };

type Row = { key: string; kind: "phone" | "email"; deals: { id: string; number: number; title: string; stage: string; color: string; created: string; assignee: string | null }[] };

/** Группы сделок одного человека (по телефону или e-mail) — чтобы объединить их в одну. */
export default async function DuplicatesPage() {
  const staff = await requireStaff("deals.view", "deals.edit");
  const { rows } = await db.execute<Row>(sql`
    with keys as (
      select d.id, 'phone' as kind, right(regexp_replace(p, '\\D', '', 'g'), 10) as key
      from crm_deals d cross join lateral unnest(array_append(d.extra_phones, coalesce(d.contact_phone, ''))) p
      union
      select d.id, 'email', lower(d.contact_email) from crm_deals d where coalesce(d.contact_email, '') <> ''
    ), groups as (
      select kind, key, array_agg(distinct id) as ids from keys where length(key) >= 6 group by kind, key having count(distinct id) > 1
    )
    select g.kind, g.key, json_agg(json_build_object('id', d.id, 'number', d.number, 'title', d.title, 'stage', s.name, 'color', s.color, 'created', d.created_at, 'assignee', d.assignee_id) order by d.created_at) as deals
    from groups g join crm_deals d on d.id = any(g.ids) join crm_stages s on s.id = d.stage_id
    group by g.kind, g.key
    order by max(d.created_at) desc
    limit 100`);
  const visible = rows.map((r) => ({ ...r, deals: r.deals.filter((d) => canSeeAssigned(staff, d.assignee)) })).filter((r) => r.deals.length > 1);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/admin/deals" className="text-sm text-muted hover:text-ink">
        ← Сделки
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Дубли</h1>
        <p className="mt-1 text-sm text-muted">Сделки с одинаковым телефоном (включая дополнительные номера) или e-mail. Откройте основную сделку и нажмите «Объединить сюда» у лишней.</p>
      </div>
      {visible.length === 0 ? <p className="rounded-2xl border border-line bg-white p-6 text-center text-sm text-muted">Дублей не найдено 🎉</p> : null}
      {visible.map((g) => (
        <section key={g.kind + g.key} className="overflow-hidden rounded-2xl border border-line bg-white">
          <h2 className="border-b border-line px-4 py-2.5 text-sm font-semibold">
            {g.kind === "phone" ? contactView(staff, { phone: formatPhone(g.key) }).phone : contactView(staff, { email: g.key }).email} · {g.deals.length} сделки
          </h2>
          <div className="divide-y divide-line">
            {g.deals.map((d) => (
              <Link key={d.id} href={`/admin/deals/${d.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-cream/40">
                <span className="w-12 font-medium">№{d.number}</span>
                <span className="min-w-0 flex-1 truncate">{d.title}</span>
                <span className="rounded-full px-2 py-0.5 text-[11px] text-white" style={{ background: d.color }}>
                  {d.stage}
                </span>
                <span className="w-24 text-right text-xs text-muted">{formatDate(d.created)}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
