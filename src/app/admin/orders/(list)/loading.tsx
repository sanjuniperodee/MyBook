/** Заготовка «Заказов»: шапка с видом, вкладки статусов, строка фильтров и таблица. */
import { SkFilters, SkHeader, SkPage, SkTable, SkTabs } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-5">
      <SkHeader title="w-32" subtitle actions={2} />
      <div className="space-y-3">
        <SkTabs n={7} pills />
        <SkFilters fields={5} />
      </div>
      <SkTable cols={6} rows={7} check />
    </SkPage>
  );
}
