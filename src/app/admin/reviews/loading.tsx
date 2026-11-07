/** Заготовка «Отзывов»: показатели, вкладки статусов и отзывы одним листом. */
import { SkCard, SkHeader, SkPage, SkStats, SkTabs } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-5">
      <SkHeader title="w-48" subtitle />
      <SkStats n={4} />
      <SkTabs n={4} pills />
      <SkCard lines={5} />
    </SkPage>
  );
}
