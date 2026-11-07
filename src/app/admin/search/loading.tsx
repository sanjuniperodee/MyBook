/** Заготовка поиска: заголовок, разделы и группы результатов (сделки, заказы, клиенты). */
import { SkCard, SkHeader, SkPage, SkTabs } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-5">
      <SkHeader title="w-56" subtitle />
      <SkTabs n={3} pills />
      <SkCard lines={3} />
      <SkCard lines={3} />
    </SkPage>
  );
}
