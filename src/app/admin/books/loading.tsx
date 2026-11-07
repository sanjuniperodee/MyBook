/** Заготовка «Книг»: заголовок и ведомость одним листом — поиск и тема, чипы этапов, строки таблицы. */
import { Bar, SkHeader, SkPage } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-4 lg:space-y-5">
      <SkHeader title="w-28" subtitle />
      <div className="flex flex-col gap-3 lg:gap-0 lg:overflow-clip lg:rounded-[var(--r-panel)] lg:border lg:border-line lg:bg-white">
        <div className="flex items-center gap-2 lg:border-b lg:border-line lg:p-3">
          <div className="skeleton h-11 flex-1 lg:h-9 lg:w-80 lg:flex-none" />
          <div className="skeleton size-11 lg:hidden" />
          <div className="skeleton h-9 w-48 max-lg:hidden" />
        </div>
        <div className="flex gap-1.5 overflow-hidden lg:border-b lg:border-line lg:px-3 lg:py-2.5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="skeleton h-10 w-28 shrink-0 lg:h-7" />
          ))}
        </div>
        <div className="panel divide-y divide-line overflow-hidden lg:rounded-none lg:border-0">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5 lg:px-5">
              <div className="min-w-0 flex-[2] space-y-1.5">
                <Bar className="w-2/3" />
                <Bar className="h-3 w-1/2 opacity-70" />
              </div>
              <Bar className="flex-1" />
              <Bar className="w-24 max-lg:hidden" />
              <Bar className="w-16 max-lg:hidden" />
              <Bar className="w-20 max-lg:hidden" />
            </div>
          ))}
        </div>
      </div>
    </SkPage>
  );
}
