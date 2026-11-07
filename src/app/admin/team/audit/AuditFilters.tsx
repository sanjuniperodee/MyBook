"use client";

import { useRouter } from "next/navigation";

/** Фильтры журнала: кто и какая область. Меняют адрес (?actor=…&entity=…), поэтому выборку можно сохранить в закладках и отправить коллеге. */
export function AuditFilters({ staff, actor, entity, entities }: { staff: { id: string; label: string }[]; actor?: string; entity?: string; entities: { id: string; label: string; n: number }[] }) {
  const router = useRouter();
  const go = (a?: string, e?: string) => {
    const p = new URLSearchParams();
    if (a) p.set("actor", a);
    if (e) p.set("entity", e);
    router.push(`/admin/team/audit${p.size ? `?${p}` : ""}`);
  };
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="audit-filters">
      <select className="input w-56 max-sm:w-full" value={actor ?? ""} onChange={(e) => go(e.target.value || undefined, entity)} aria-label="Сотрудник">
        <option value="">Все сотрудники</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      <div className="no-scrollbar flex max-w-full gap-1.5 overflow-x-auto">
        <button type="button" className="chip" aria-pressed={!entity} onClick={() => go(actor, undefined)}>
          Все области
        </button>
        {entities.map((x) => (
          <button key={x.id} type="button" className="chip" aria-pressed={entity === x.id} onClick={() => go(actor, x.id)}>
            {x.label} <span className="tabular-nums opacity-70">{x.n}</span>
          </button>
        ))}
      </div>
      {actor || entity ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => go()}>
          Сбросить фильтры
        </button>
      ) : null}
    </div>
  );
}
