/** Заготовка «Отзывов»: вкладки статусов, отзывы одним листом и колонка сводки справа (на телефоне — строка показателей). */
import { Bar, SkHeader, SkPage, SkStats, SkTabs } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-4 lg:space-y-5">
      <SkHeader title="w-48" subtitle />
      <SkStats n={4} className="xl:hidden" />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_19rem] xl:gap-5">
        <div className="space-y-3">
          <SkTabs n={4} />
          <div className="panel divide-y divide-line overflow-hidden">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[10rem_minmax(0,1fr)_12rem] lg:gap-6">
                <div className="space-y-2">
                  <Bar className="w-24" />
                  <Bar className="h-3 w-16" />
                </div>
                <div className="space-y-2">
                  <Bar className="w-full" />
                  <Bar className="w-5/6" />
                  <Bar className="h-3 w-1/3" />
                </div>
                <div className="skeleton h-8 w-full max-lg:w-40" />
              </div>
            ))}
          </div>
        </div>
        <div className="panel space-y-3 p-5 max-xl:hidden">
          <div className="skeleton h-4 w-20" />
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex justify-between">
              <Bar className="w-24" />
              <Bar className="w-10" />
            </div>
          ))}
        </div>
      </div>
    </SkPage>
  );
}
