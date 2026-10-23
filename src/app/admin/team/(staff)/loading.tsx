/** Заготовка «Команды» (шапка и вкладки остаются из layout): таблица сотрудников. */
import { SkCard, SkPage, SkTable } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage>
      <SkTable cols={6} rows={4} />
      <SkCard lines={1} />
    </SkPage>
  );
}
