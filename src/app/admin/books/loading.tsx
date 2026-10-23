/** Заготовка «Книг»: вид прогресса, поиск и таблица книг. */
import { SkFilters, SkHeader, SkPage, SkTable, SkTabs } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-5">
      <SkHeader title="w-28" subtitle />
      <SkTabs n={5} pills />
      <SkFilters fields={2} />
      <SkTable cols={5} rows={8} />
    </SkPage>
  );
}
