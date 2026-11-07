/** Заготовка статистики ИИ-дизайнера: указатель разделов слева, показатели, ведомости и настройки справа. */
import { Bar, SkHeader, SkPage, SkStats, SkTable } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage>
      <SkHeader title="w-40" subtitle />
      <div className="grid gap-8 xl:grid-cols-[12rem_minmax(0,1fr)]">
        <div className="hidden space-y-2 xl:block">
          {Array.from({ length: 6 }, (_, i) => (
            <Bar key={i} className="h-5 w-32" />
          ))}
        </div>
        <div className="space-y-8">
          <div className="skeleton h-8 w-64 rounded-[var(--r-ctl)]" />
          <SkStats n={4} />
          <div className="space-y-2">
            <Bar className="h-4 w-48" />
            <SkTable cols={3} rows={3} />
          </div>
          <div className="space-y-2">
            <Bar className="h-4 w-40" />
            <SkTable cols={6} rows={4} />
          </div>
        </div>
      </div>
    </SkPage>
  );
}
