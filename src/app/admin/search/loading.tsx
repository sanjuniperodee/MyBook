/** Заготовка поиска: заголовок и группы результатов (сделки, клиенты, заказы). */
import { SkHeader, SkPage, SkRows } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-8">
      <SkHeader title="w-56" />
      <div className="space-y-3">
        <div className="skeleton h-4 w-24" />
        <SkRows rows={3} />
      </div>
      <div className="space-y-3">
        <div className="skeleton h-4 w-24" />
        <SkRows rows={3} />
      </div>
    </SkPage>
  );
}
