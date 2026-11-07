/** Заготовка «Интеграций»: шапка, вкладки, якоря слева и стопка листов справа. */
import { Bar, SkHeader, SkPage, SkTabs } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="mx-auto max-w-6xl space-y-5">
      <SkHeader title="w-72" subtitle />
      <SkTabs n={7} />
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
        <div className="hidden space-y-2.5 lg:block">
          {Array.from({ length: 5 }, (_, i) => (
            <Bar key={i} className="h-4 w-36" />
          ))}
        </div>
        <div className="min-w-0 space-y-4">
          {[2, 1, 1].map((fields, i) => (
            <div key={i} className="panel">
              <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="space-y-2">
                  <div className="skeleton h-4 w-44" />
                  <Bar className="h-3 w-64 max-w-full" />
                </div>
                <div className="skeleton h-7 w-24" />
              </div>
              {i === 0 ? (
                <div className="space-y-4 border-t border-line p-4 sm:p-5">
                  {Array.from({ length: fields }, (_, j) => (
                    <div key={j} className="max-w-[40rem] space-y-1.5">
                      <Bar className="h-3 w-28" />
                      <div className="skeleton h-9 w-full" />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </SkPage>
  );
}
