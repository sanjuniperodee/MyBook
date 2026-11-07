/** Заготовка «Журнала действий»: фильтры и ведомость по дням. */
import { SkPage, SkTable } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="skeleton h-9 w-56" />
        <div className="skeleton h-9 w-28" />
        <div className="skeleton h-9 w-24" />
      </div>
      <SkTable cols={4} rows={10} />
    </SkPage>
  );
}
