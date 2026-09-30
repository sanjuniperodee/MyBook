import Link from "next/link";
import { Download } from "lucide-react";
import { clientSegments, type ClientSegment } from "@/lib/crm";
import { queryClients, segmentCounts, type ClientSort } from "@/lib/crm-clients";
import { formatPrice } from "@/config/site";
import { cn, formatDate } from "@/lib/utils";
import { can, contactView, requireStaff } from "@/lib/crm/rbac";
import { adminLabel, listAdmins } from "@/lib/crm";

export const metadata = { title: "Клиенты" };
const PAGE = 50;

function relative(d: Date | null) {
  if (!d) return "—";
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  if (days <= 0) return "сегодня";
  if (days === 1) return "вчера";
  if (days < 30) return `${days} дн. назад`;
  return formatDate(d);
}

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ segment?: string; q?: string; tag?: string; sort?: string; page?: string; mine?: string }> }) {
  const staff = await requireStaff("clients.view");
  const sp = await searchParams;
  const segment = (sp.segment && sp.segment in clientSegments ? sp.segment : "all") as ClientSegment;
  const sort = (["new", "ltv", "active"].includes(sp.sort ?? "") ? sp.sort : "new") as ClientSort;
  const page = Math.max(1, Number(sp.page) || 1);
  // Роль «только свои» видит своих клиентов и неразобранных (без ответственного).
  const scopeManagerId = staff.scope === "own" ? staff.user.id : null;
  const onlyMine = sp.mine === "1";
  const [{ rows, total }, counts, admins] = await Promise.all([
    queryClients({ segment, q: sp.q, tag: sp.tag, sort, limit: PAGE, offset: (page - 1) * PAGE, scopeManagerId: scopeManagerId ?? (onlyMine ? staff.user.id : null), onlyMine }),
    segmentCounts(scopeManagerId),
    listAdmins(),
  ]);
  const managerName = new Map(admins.map((a) => [a.id, adminLabel(a)]));
  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ segment, q: sp.q, tag: sp.tag, sort, mine: onlyMine ? "1" : undefined, ...patch }).filter(([, v]) => v && v !== "all" && v !== "new") as [string, string][]);
    return `/admin/clients?${p}`;
  };
  const exportQs = new URLSearchParams(Object.entries({ segment, q: sp.q, tag: sp.tag }).filter(([, v]) => v) as [string, string][]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Клиенты</h1>
          <p className="text-sm text-muted">Найдено {total}{sp.tag ? ` · тег «${sp.tag}»` : ""}</p>
        </div>
        {can(staff, "clients.export", "clients.contacts") ? (
          <a href={`/api/admin/export/clients?${exportQs}`} className="btn btn-outline btn-sm">
            <Download className="size-4" /> CSV
          </a>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(clientSegments) as ClientSegment[]).map((s) => (
          <Link key={s} href={link({ segment: s, page: undefined })} className={cn("rounded-full px-3 py-1.5 text-sm", segment === s ? "bg-ink text-white" : "bg-white text-ink-soft hover:bg-cream")}>
            {clientSegments[s]} <span className="opacity-60">{counts[s]}</span>
          </Link>
        ))}
      </div>

      <form className="flex flex-wrap gap-2">
        <input type="hidden" name="segment" value={segment} />
        <input name="q" defaultValue={sp.q} placeholder="Имя, e-mail, телефон" className="input h-10 w-72 text-sm" />
        <select name="sort" defaultValue={sort} className="input h-10 w-56 text-sm">
          <option value="new">Сначала новые</option>
          <option value="ltv">По сумме покупок</option>
          <option value="active">По последнему визиту</option>
        </select>
        <label className="flex h-10 items-center gap-2 px-2 text-sm text-ink-soft">
          <input type="checkbox" name="mine" value="1" defaultChecked={onlyMine} className="accent-wine" /> Только мои
        </label>
        <button className="btn btn-dark btn-sm h-10">Найти</button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Клиент</th>
              <th className="px-3 py-3 font-medium">Книги</th>
              <th className="px-3 py-3 text-right font-medium">Заказы</th>
              <th className="px-3 py-3 text-right font-medium">LTV</th>
              <th className="px-3 py-3 font-medium">Последний визит</th>
              <th className="px-3 py-3 font-medium">Регистрация</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.user.id} className="hover:bg-cream/40">
                <td className="px-4 py-3">
                  <Link href={`/admin/clients/${r.user.id}`} className="font-medium hover:text-wine hover:underline">
                    {r.user.name || r.user.email.split("@")[0]}
                  </Link>
                  {(() => {
                    const c = contactView(staff, r.user);
                    return (
                      <div className="text-xs text-muted">
                        {c.email}
                        {c.phone ? ` · ${c.phone}` : ""}
                        {r.user.managerId ? ` · 👤 ${managerName.get(r.user.managerId) ?? "—"}` : ""}
                      </div>
                    );
                  })()}
                  {r.user.tags.length ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.user.tags.map((t) => (
                        <Link key={t} href={link({ tag: t, page: undefined })} className="rounded-full bg-rose px-2 py-0.5 text-[11px] text-wine">
                          {t}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-3">
                  {r.booksCount ? (
                    <>
                      {r.booksCount} · {r.bestAnswered} отв.
                      <div className="text-xs text-muted">изм. {relative(r.lastBookUpdate)}</div>
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{r.ordersCount || "—"}</td>
                <td className="px-3 py-3 text-right font-medium tabular-nums">{r.ltv ? formatPrice(r.ltv) : "—"}</td>
                <td className="px-3 py-3 text-muted">{relative(r.user.lastSeenAt)}</td>
                <td className="px-3 py-3 text-muted">{formatDate(r.user.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="py-10 text-center text-muted">Никого не нашли</p> : null}
      </div>

      {total > PAGE ? (
        <div className="flex items-center justify-center gap-3 text-sm">
          {page > 1 ? <Link className="btn btn-outline btn-sm" href={link({ page: String(page - 1) })}>← Назад</Link> : null}
          <span className="text-muted">
            {page} из {Math.ceil(total / PAGE)}
          </span>
          {page * PAGE < total ? <Link className="btn btn-outline btn-sm" href={link({ page: String(page + 1) })}>Дальше →</Link> : null}
        </div>
      ) : null}
    </div>
  );
}
