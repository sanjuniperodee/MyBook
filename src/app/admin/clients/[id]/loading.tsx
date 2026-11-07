/** Заготовка карточки клиента: шапка с аватаром, сводка, сделки и задачи слева, профиль справа. */
import { SkCard, SkHeader, SkPage, SkRows, SkStats } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-5">
      <SkHeader back title="w-64" actions={1} />
      <SkStats n={5} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <SkRows rows={3} />
          <SkCard lines={4} />
          <SkCard lines={5} />
        </div>
        <div className="min-w-0 space-y-5">
          <SkCard lines={6} />
          <SkCard lines={2} />
        </div>
      </div>
    </SkPage>
  );
}
