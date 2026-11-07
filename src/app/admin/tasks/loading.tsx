/** Заготовка «Задач»: шапка с «Новой задачей», фильтры, якоря групп и список задач. */
import { SkHeader, SkPage, SkRows, SkTabs } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="max-w-5xl space-y-5">
      <SkHeader title="w-32" subtitle actions={1} />
      <SkTabs n={5} pills />
      <SkRows rows={8} action={false} />
    </SkPage>
  );
}
