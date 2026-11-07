/** Заготовка «Сертификатов»: шапка, очередь «Ждут оплаты» со строкой-кнопкой, показатели одной строкой и ведомость. */
import { Bar, SkHeader, SkPage, SkStats, SkTable } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-5">
      <SkHeader title="w-64" subtitle actions={1} />
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
            <div className="skeleton h-7 w-40 max-sm:hidden" />
          </div>
        ))}
      </div>
      <SkStats n={4} />
      <SkTable cols={6} rows={5} />
    </SkPage>
  );
}
