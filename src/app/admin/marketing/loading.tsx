/** Заготовка «Ссылок и каналов»: период, строка показателей и три ведомости. */
import { Bar, SkHeader, SkPage, SkStats, SkTable } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage>
      <SkHeader title="w-56" subtitle actions={2} />
      <div className="skeleton h-8 w-72 rounded-[var(--r-ctl)]" />
      <SkStats n={5} />
      <div className="space-y-2">
        <Bar className="h-4 w-44" />
        <SkTable cols={7} rows={3} />
      </div>
      <div className="space-y-2">
        <Bar className="h-4 w-20" />
        <SkTable cols={6} rows={3} />
      </div>
    </SkPage>
  );
}
