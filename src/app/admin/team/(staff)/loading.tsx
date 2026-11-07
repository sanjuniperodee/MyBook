/** Заготовка «Команды» (шапка и вкладки остаются из layout): панель инструментов и ведомость сотрудников. */
import { SkPage, SkTable } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="skeleton h-9 w-72 max-w-full" />
        <div className="skeleton h-9 w-20" />
        <div className="skeleton h-9 w-24" />
        <div className="skeleton ml-auto h-9 w-48" />
      </div>
      <SkTable cols={6} rows={4} />
    </SkPage>
  );
}
