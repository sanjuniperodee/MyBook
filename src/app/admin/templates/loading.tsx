/** Заготовка «Шаблонов»: список слева и редактор справа. */
import { Bar, SkHeader, SkPage } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-5">
      <SkHeader title="w-48" subtitle />
      <div className="panel overflow-hidden lg:grid lg:h-[28rem] lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="divide-y divide-line border-line lg:border-r">
          <div className="p-3">
            <div className="skeleton h-9 w-full rounded-[var(--r-ctl)]" />
          </div>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="space-y-2 px-4 py-3">
              <Bar className="w-1/2" />
              <Bar className="h-3 w-5/6 opacity-70" />
            </div>
          ))}
        </div>
        <div className="hidden space-y-4 p-5 lg:block">
          <Bar className="h-5 w-40" />
          <div className="skeleton h-9 w-full rounded-[var(--r-ctl)]" />
          <div className="skeleton h-44 w-full rounded-[var(--r-ctl)]" />
        </div>
      </div>
    </SkPage>
  );
}
