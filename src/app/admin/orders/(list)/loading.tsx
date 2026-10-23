/** Заготовка «Заказов»: фильтры и таблица заказов. */
import { SkFilters, SkHeader, SkPage, SkTable } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-5">
      <SkHeader title="w-32" subtitle actions={2} />
      <SkFilters fields={5} />
      <SkTable cols={7} rows={7} check />
    </SkPage>
  );
}
