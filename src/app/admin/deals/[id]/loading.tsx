/** Заготовка карточки сделки: шапка с номером, суммой и этапами; слева разделы и листы, справа — липкая колонка контекста. */
import { Bar, SkCard, SkForm, SkPage } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-5">
      <Bar className="h-3 w-20" />
      <div className="overflow-hidden rounded-[var(--r-panel)] border border-line bg-white">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="space-y-2">
            <div className="skeleton h-8 w-72 max-w-full" />
            <Bar className="w-64 max-w-full" />
          </div>
          <div className="skeleton h-8 w-32" />
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-line px-5 py-4">
          <Bar className="w-72" />
          <div className="skeleton h-9 w-40 rounded-[var(--r-ctl)]" />
        </div>
        <div className="flex gap-2 border-t border-line bg-sunken/50 px-4 py-3">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex-1 space-y-2">
              <div className="skeleton h-1 rounded-full" />
              <Bar className="h-3 w-20" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,47rem)_minmax(20rem,1fr)]">
        <div className="min-w-0 space-y-5">
          <div className="flex gap-5 border-b border-line pb-2.5">
            {[16, 20, 16].map((w, i) => (
              <div key={i} className="skeleton h-4" style={{ width: `${w * 4}px` }} />
            ))}
          </div>
          <SkCard lines={5} />
          <SkCard lines={4} />
          <SkForm fields={4} />
        </div>
        <div className="min-w-0 max-xl:hidden">
          <SkCard lines={10} />
        </div>
      </div>
    </SkPage>
  );
}
