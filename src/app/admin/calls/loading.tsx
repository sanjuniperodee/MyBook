/** Заготовка «Звонков»: итоги, панель инструментов и ведомость журнала. */
import { Bar, SkHeader, SkPage, SkTable } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-5">
      <SkHeader title="w-32" subtitle />
      <div className="skeleton h-[4.25rem] rounded-[var(--r-panel)]" />
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skeleton h-7 w-24 rounded-[var(--r-ctl)]" />
          ))}
        </div>
        <Bar className="h-7 w-64 rounded-[var(--r-ctl)]" />
      </div>
      <SkTable cols={7} rows={6} />
    </SkPage>
  );
}
