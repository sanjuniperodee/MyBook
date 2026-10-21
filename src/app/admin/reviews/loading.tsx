/** Заготовка «Отзывов»: плитки, вкладки и карточки отзывов. */
import { SkCard, SkHeader, SkPage, SkStats, SkTabs } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage>
      <SkHeader title="w-48" subtitle />
      <SkStats n={4} />
      <SkTabs n={4} pills />
      <SkCard lines={4} />
      <SkCard lines={4} />
    </SkPage>
  );
}
