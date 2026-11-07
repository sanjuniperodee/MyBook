/** Заготовка «Производства»: шапка, фильтр ответственных с переключателем вида и колонки статусов с карточками; на телефоне — поиск, вкладки статусов и лента. */
import { Bar, SkPage } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-4 lg:space-y-5">
      <div className="space-y-2">
        <div className="skeleton h-8 w-44" />
        <Bar className="w-72 max-w-full max-lg:hidden" />
      </div>
      <div className="space-y-3 lg:hidden">
        <div className="skeleton h-11 w-full" />
        <div className="flex gap-1.5 overflow-hidden">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skeleton h-10 w-32 shrink-0" />
          ))}
        </div>
        <div className="panel divide-y divide-line">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-2 px-4 py-3.5">
              <Bar className="w-2/3" />
              <Bar className="h-3 w-1/2 opacity-70" />
              <Bar className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3 max-lg:hidden">
        <div className="flex items-center gap-2">
          <div className="skeleton h-7 w-14" />
          <div className="skeleton h-7 w-16" />
          <div className="skeleton h-7 w-40" />
          <div className="skeleton ml-auto h-7 w-44" />
        </div>
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 5 }, (_, c) => (
            <div key={c} className="min-w-[14rem] flex-1 space-y-2 rounded-[var(--r-panel)] bg-sunken/70 p-2">
              <div className="flex items-center justify-between px-1 py-1">
                <div className="skeleton h-4 w-28" />
                <Bar className="h-3 w-12" />
              </div>
              {Array.from({ length: Math.max(1, 3 - (c % 3)) }, (_, i) => (
                <div key={i} className="space-y-2 rounded-[var(--r-ctl)] border border-line bg-white p-3">
                  <div className="flex justify-between">
                    <Bar className="w-8" />
                    <Bar className="w-16" />
                  </div>
                  <Bar className="w-3/4" />
                  <Bar className="h-3 w-1/2 opacity-70" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </SkPage>
  );
}
