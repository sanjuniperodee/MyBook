/** Заготовка «Звонков»: шапка, итоги, фильтры и журнал — той же формы, что страница. */
import { SkHeader, SkPage, SkStats, SkTable, SkTabs } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-6">
      <SkHeader title="w-32" subtitle />
      <SkStats n={4} />
      <SkTabs n={5} pills />
      <SkTable cols={6} rows={8} />
    </SkPage>
  );
}
