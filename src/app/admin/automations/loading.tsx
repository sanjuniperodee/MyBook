/** Заготовка «Автоматизаций»: итоги одной строкой и ведомость правил. */
import { Bar, SkHeader, SkPage } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-5">
      <SkHeader title="w-48" subtitle actions={1} />
      <div className="skeleton h-[4.25rem] rounded-[var(--r-panel)]" />
      <div className="panel divide-y divide-line overflow-hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3.5">
            <Bar className="w-20" />
            <div className="min-w-0 flex-1 space-y-2">
              <Bar className="w-1/3" />
              <Bar className="h-3 w-2/3 opacity-70" />
            </div>
            <Bar className="hidden w-32 lg:block" />
            <div className="skeleton h-8 w-20 rounded-[var(--r-ctl)]" />
          </div>
        ))}
      </div>
    </SkPage>
  );
}
