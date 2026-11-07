/** Заготовка «Аналитики продаж»: плитки, воронка, каналы и менеджеры. */
import { SkCard, SkHeader, SkPage, SkStats, SkTable, SkTabs } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage>
      <SkHeader title="w-64" subtitle actions={1} />
      <SkTabs n={3} pills />
      <SkStats n={6} />
      <div className="grid gap-4 xl:grid-cols-2">
        <SkCard lines={6} />
        <SkTable cols={4} rows={4} />
      </div>
      <SkTable cols={8} rows={4} />
    </SkPage>
  );
}
