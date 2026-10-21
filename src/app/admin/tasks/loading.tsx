/** Заготовка «Задач»: вкладки и список задач со сроком. */
import { SkHeader, SkPage, SkRows, SkTabs } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="max-w-5xl space-y-4">
      <SkHeader title="w-32" subtitle />
      <SkTabs n={4} pills />
      <SkRows rows={8} action={false} />
    </SkPage>
  );
}
