/** Заготовка «Сделок»: шапка, ответственные, фильтры и доска воронки. */
import { SkBoard, SkFilters, SkHeader, SkPage, SkTabs } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-4">
      <SkHeader title="w-36" actions={3} />
      <SkTabs n={5} pills />
      <SkFilters fields={3} />
      <SkBoard columns={4} cards={4} />
    </SkPage>
  );
}
