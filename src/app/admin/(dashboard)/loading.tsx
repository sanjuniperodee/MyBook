/** Заготовка «Обзора» (она же — запасная для разделов без своей): «Мой день», плитки выручки, график и воронка. */
import { SkCard, SkChart, SkHeader, SkPage, SkRows, SkStats } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage>
      <SkHeader actions={1} title="w-32" />
      <SkStats n={5} />
      <SkRows rows={3} action={false} />
      <SkStats n={4} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <SkChart />
        <SkCard lines={5} />
      </div>
    </SkPage>
  );
}
