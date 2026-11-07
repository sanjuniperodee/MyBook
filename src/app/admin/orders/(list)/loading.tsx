/** Заготовка «Заказов»: заголовок, ведомость одним листом — панель инструментов, чипы статусов, строки таблицы, подвал. */
import { Bar, SkPage } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-4 lg:space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="skeleton h-8 w-32" />
        <div className="skeleton h-7 w-36 max-lg:hidden" />
      </div>
      <div className="flex flex-col gap-3 lg:gap-0 lg:overflow-clip lg:rounded-[var(--r-panel)] lg:border lg:border-line lg:bg-white">
        <div className="flex items-center gap-2 lg:border-b lg:border-line lg:p-3">
          <div className="skeleton h-11 flex-1 lg:h-9 lg:w-72 lg:flex-none" />
          <div className="skeleton size-11 lg:hidden" />
          <div className="skeleton h-9 w-40 max-lg:hidden" />
          <div className="skeleton h-9 w-44 max-lg:hidden" />
          <div className="skeleton ml-auto h-7 w-44 max-lg:hidden" />
        </div>
        <div className="flex gap-1.5 overflow-hidden lg:border-b lg:border-line lg:px-3 lg:py-2.5">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="skeleton h-10 w-28 shrink-0 lg:h-7" />
          ))}
        </div>
        <div className="panel divide-y divide-line overflow-hidden lg:rounded-none lg:border-0">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5 lg:px-5">
              <div className="skeleton size-4 max-lg:hidden" />
              <div className="w-14 space-y-1.5">
                <Bar className="w-10" />
                <Bar className="h-3 w-12 opacity-70" />
              </div>
              <div className="min-w-0 flex-[2] space-y-1.5">
                <Bar className="w-2/3" />
                <Bar className="h-3 w-1/2 opacity-70" />
              </div>
              <Bar className="flex-1 max-lg:hidden" />
              <Bar className="w-20" />
              <Bar className="w-24 max-lg:hidden" />
              <Bar className="w-16 max-lg:hidden" />
              <Bar className="w-24 max-lg:hidden" />
            </div>
          ))}
        </div>
      </div>
    </SkPage>
  );
}
