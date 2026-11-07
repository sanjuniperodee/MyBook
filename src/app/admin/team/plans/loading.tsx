/** Заготовка «Планов продаж»: месяц, строка показателей и ведомость сотрудников. */
import { SkPage, SkStats, SkTable } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-4">
      <div className="skeleton h-8 w-56" />
      <SkStats n={4} />
      <SkTable cols={5} rows={4} />
    </SkPage>
  );
}
