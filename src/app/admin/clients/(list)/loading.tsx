/** Заготовка «Клиентов»: сегменты, поиск и таблица. */
import { SkFilters, SkHeader, SkPage, SkTable, SkTabs } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-5">
      <SkHeader title="w-36" subtitle actions={2} />
      <SkTabs n={6} pills />
      <SkFilters fields={3} />
      <SkTable cols={6} rows={8} />
    </SkPage>
  );
}
