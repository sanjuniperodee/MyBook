/** Заготовка «Аналитики продаж»: период, строка показателей, воронка и каналы, ведомость менеджеров. */
import { Bar, SkHeader, SkPage, SkStats, SkTable } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage>
      <SkHeader title="w-64" subtitle actions={1} />
      <div className="skeleton h-8 w-64 rounded-[var(--r-ctl)]" />
      <SkStats n={6} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-2">
          <Bar className="h-4 w-24" />
          <SkTable cols={4} rows={5} />
        </div>
        <div className="space-y-2">
          <Bar className="h-4 w-24" />
          <SkTable cols={4} rows={4} />
        </div>
      </div>
      <div className="space-y-2">
        <Bar className="h-4 w-28" />
        <SkTable cols={8} rows={3} />
      </div>
    </SkPage>
  );
}
