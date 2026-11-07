/** Заготовка «Обзора» (она же — запасная для разделов без своей): строка чисел, справа очередь действий, слева задачи, продажи и график. */
import { SkCard, SkChart, SkHeader, SkPage, SkRows, SkStats } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage>
      <SkHeader actions={1} title="w-32" />
      <SkStats n={5} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-5 xl:order-2">
          <SkCard lines={3} />
          <SkCard lines={2} />
        </div>
        <div className="space-y-5 xl:order-1">
          <SkRows rows={3} action={false} />
          <SkChart />
          <SkCard lines={4} />
        </div>
      </div>
    </SkPage>
  );
}
