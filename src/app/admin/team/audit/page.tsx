import { container } from "@/server/container";
import Link from "next/link";
import { requireStaff } from "@/server/access";
import { staffLabel } from "@/shared/domain/staff";
import { formatDate, nowMs } from "@/lib/dates";
import { storeTimeZone } from "@/shared/domain/time";
import { History } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { AuditFilters } from "./AuditFilters";
import { actions, detailsText, entityLabels } from "./phrases";

export const metadata = { title: "Журнал действий" };

const hhmm = (d: Date) => new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: storeTimeZone() }).format(d);

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ actor?: string; entity?: string }> }) {
  await requireStaff("team.manage", "audit.view");
  const sp = await searchParams;
  const actor = sp.actor && /^[0-9a-f-]{36}$/.test(sp.actor) ? sp.actor : undefined;
  const entity = sp.entity ? sp.entity.slice(0, 30) : undefined;
  const [rows, team] = await Promise.all([container().access.queries.auditLog({ actorId: actor, entity }), container().access.queries.allStaff()]);

  // Области, которые встречаются в выборке, — чипами; выбранная остаётся в списке, даже если в выборке только она.
  const counts = new Map<string, number>();
  for (const { a } of rows) counts.set(a.entity, (counts.get(a.entity) ?? 0) + 1);
  if (entity && !counts.has(entity)) counts.set(entity, 0);
  const entities = [...counts.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, 8)
    .map(([id, n]) => ({ id, label: entityLabels[id] ?? id, n }));

  // Записи по дням: «Сегодня», «Вчера», дальше дата.
  const today = formatDate(new Date(nowMs()));
  const yesterday = formatDate(new Date(nowMs() - 86_400_000));
  const days: { key: string; label: string; items: typeof rows }[] = [];
  for (const r of rows) {
    const key = formatDate(r.a.createdAt);
    const last = days[days.length - 1];
    if (last?.key === key) last.items.push(r);
    else days.push({ key, label: key === today ? "Сегодня" : key === yesterday ? "Вчера" : key, items: [r] });
  }
  const who = (r: (typeof rows)[number]) =>
    r.a.actorId ? (
      <Link href={`/admin/team/audit?actor=${r.a.actorId}`} className="hover:text-wine">
        {staffLabel(r.actor?.email ? { name: r.actor.name ?? "", email: r.actor.email } : null)}
      </Link>
    ) : (
      <span className="text-muted">система</span>
    );

  return (
    <div className="space-y-4">
      <AuditFilters staff={team.map((s) => ({ id: s.id, label: staffLabel({ name: s.name, email: s.email }) }))} actor={actor} entity={entity} entities={entities} />
      <section className="panel overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState compact icon={History} title={actor || entity ? "По этому фильтру записей нет" : "Записей пока нет"} action={actor || entity ? <Link href="/admin/team/audit" className="btn btn-outline btn-sm">Сбросить фильтры</Link> : undefined}>
            {actor || entity ? "Уберите фильтр или выберите другую область." : "Смена ролей, выгрузки, удаления и другие важные действия сотрудников появятся здесь."}
          </EmptyState>
        ) : (
          <>
            <div className="max-lg:hidden lg:overflow-x-auto">
              <table className="table min-w-[760px]" data-testid="audit-table">
                <thead>
                  <tr>
                    <th className="w-20">Время</th>
                    <th>Кто</th>
                    <th>Что сделал</th>
                    <th>Подробности</th>
                    <th>IP</th>
                  </tr>
                </thead>
                {days.map((d) => (
                  <tbody key={d.key}>
                    <tr>
                      <th colSpan={5} className="!bg-white !py-2 !text-[13px] !font-semibold !text-ink first-letter:uppercase">
                        {d.label}
                      </th>
                    </tr>
                    {d.items.map((r) => (
                      <tr key={r.a.id}>
                        <td className="whitespace-nowrap text-muted tabular-nums">{hhmm(r.a.createdAt)}</td>
                        <td className="whitespace-nowrap">{who(r)}</td>
                        <td>
                          <Link href={`/admin/team/audit?entity=${r.a.entity}`} className="hover:text-wine">
                            {actions[r.a.action] ?? r.a.action}
                          </Link>
                        </td>
                        <td className="max-w-md truncate text-xs text-muted" title={r.a.details ? JSON.stringify(r.a.details) : ""}>
                          {detailsText(r.a.details) || "—"}
                        </td>
                        <td className="text-xs text-muted">{r.a.ip ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
            <div className="lg:hidden" data-testid="audit-cards">
              {days.map((d) => (
                <div key={d.key}>
                  <h3 className="border-b border-line bg-sunken/70 px-4 py-1.5 text-xs font-medium text-muted first-letter:uppercase">{d.label}</h3>
                  <ul className="divide-y divide-line">
                    {d.items.map((r) => (
                      <li key={r.a.id} className="px-4 py-3">
                        <Link href={`/admin/team/audit?entity=${r.a.entity}`} className="text-[15px] font-medium">
                          {actions[r.a.action] ?? r.a.action}
                        </Link>
                        <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted">
                          {who(r)}
                          <span className="tabular-nums">{hhmm(r.a.createdAt)}</span>
                          {r.a.ip ? <span>{r.a.ip}</span> : null}
                        </div>
                        {r.a.details ? <div className="mt-1 line-clamp-2 text-xs break-words text-muted">{detailsText(r.a.details)}</div> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <footer className="border-t border-line px-4 py-2.5 text-xs text-muted sm:px-5">Показаны последние {rows.length} записей{rows.length >= 300 ? " (журнал отдаёт не больше 300)" : ""}.</footer>
          </>
        )}
      </section>
    </div>
  );
}
