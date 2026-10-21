/** Заготовка «Планов продаж»: таблица сотрудников с планами на месяц. */
import { SkPage, SkTable } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-4">
      <div className="skeleton h-9 w-56" />
      <SkTable cols={5} rows={4} />
    </SkPage>
  );
}
