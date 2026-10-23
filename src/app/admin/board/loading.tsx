/** Заготовка «Канбана заказов»: ответственные и колонки статусов. */
import { SkBoard, SkHeader, SkPage, SkTabs } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-4">
      <SkHeader title="w-44" subtitle actions={1} />
      <SkTabs n={5} pills />
      <SkBoard columns={5} cards={3} />
    </SkPage>
  );
}
