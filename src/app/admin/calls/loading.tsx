/** Заготовка «Звонков»: вкладки и журнал звонков. */
import { SkHeader, SkPage, SkTable, SkTabs } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-4">
      <SkHeader title="w-32" subtitle />
      <SkTabs n={4} pills />
      <SkTable cols={6} rows={8} />
    </SkPage>
  );
}
