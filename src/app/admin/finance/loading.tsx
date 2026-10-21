/** Заготовка «Финансов»: период, плитки денег, график и таблицы. */
import { SkCard, SkChart, SkHeader, SkPage, SkStats, SkTable, SkTabs } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage>
      <SkHeader title="w-36" subtitle />
      <SkTabs n={5} pills />
      <SkStats n={5} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <SkChart />
        <SkCard lines={5} />
      </div>
      <SkTable cols={6} rows={5} />
    </SkPage>
  );
}
