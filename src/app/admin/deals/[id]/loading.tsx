/** Заготовка карточки сделки: шапка, полоса этапов; слева контакт, оплата и детали, справа задачи и переписка. */
import { Bar, SkCard, SkForm, SkHeader, SkPage } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-5">
      <SkHeader back subtitle title="w-80" />
      <div className="flex gap-2 rounded-[14px] border border-line bg-white p-3">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex-1 space-y-2">
            <div className="skeleton h-1.5 rounded-full" />
            <Bar className="h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="min-w-0 space-y-5">
          <SkCard lines={4} />
          <SkCard lines={5} />
          <SkForm fields={6} />
        </div>
        <div className="min-w-0 space-y-5">
          <SkCard lines={3} />
          <SkCard lines={8} />
        </div>
      </div>
    </SkPage>
  );
}
