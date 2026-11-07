/** Заготовка «Задач»: шапка, одна строка фильтров и лист-очередь с группами и строками задач. */
import { Bar, SkHeader, SkPage } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-4">
      <SkHeader title="w-32" subtitle actions={1} />
      <div className="flex flex-wrap gap-2">
        <div className="skeleton h-8 w-28 rounded-[var(--r-ctl)]" />
        <div className="skeleton h-8 w-48 rounded-[var(--r-ctl)]" />
        <div className="skeleton h-8 w-72 rounded-[var(--r-ctl)]" />
      </div>
      <div className="panel overflow-hidden">
        <div className="flex gap-6 border-b border-line px-5 py-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Bar key={i} className="h-4 w-20" />
          ))}
        </div>
        <div className="border-b border-line px-5 py-3">
          <div className="skeleton h-9 w-full rounded-[var(--r-ctl)]" />
        </div>
        {[3, 4].map((n, g) => (
          <div key={g}>
            <div className="border-b border-line bg-sunken/60 px-5 py-2">
              <Bar className="h-3 w-24" />
            </div>
            <div className="divide-y divide-line">
              {Array.from({ length: n }, (_, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="skeleton size-5 shrink-0 rounded" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Bar className="w-2/3" />
                    <Bar className="h-3 w-1/3 opacity-70" />
                  </div>
                  <Bar className="hidden h-3 w-28 lg:block" />
                  <Bar className="hidden h-3 w-20 lg:block" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SkPage>
  );
}
