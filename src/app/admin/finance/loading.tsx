/** Заготовка «Финансов»: очередь «Проверить», период, строка показателей, график с разрезом и ведомость. */
import { Bar, SkHeader, SkPage, SkStats, SkTable } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-5 lg:space-y-6">
      <SkHeader title="w-36" subtitle actions={1} />
      <div className="panel divide-y divide-line overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 sm:px-5">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton h-5 w-6" />
        </div>
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1 space-y-2">
              <Bar className="w-1/3" />
              <Bar className="h-3 w-2/3 opacity-70" />
            </div>
            <Bar className="w-20" />
            <div className="skeleton h-7 w-24 max-sm:hidden" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="skeleton h-9 w-72 max-w-full lg:h-7" />
          <div className="skeleton h-9 w-64 max-w-full lg:h-9" />
        </div>
        <SkStats n={5} />
      </div>
      <div className="panel grid overflow-hidden xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4 p-5">
          <div className="skeleton h-4 w-24" />
          <div className="flex h-44 items-end gap-2">
            {[30, 55, 40, 70, 45, 85, 60, 35, 75, 50, 65, 90].map((h, i) => (
              <div key={i} className="skeleton flex-1 rounded-t-md rounded-b-none" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
        <div className="space-y-4 border-t border-line p-5 xl:border-t-0 xl:border-l">
          <div className="skeleton h-4 w-28" />
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Bar className="w-3/4" />
              <div className="skeleton h-1.5 w-full" />
            </div>
          ))}
        </div>
      </div>
      <SkTable cols={6} rows={5} />
    </SkPage>
  );
}
