/** Заготовка «Аналитики продаж»: плитки, воронка, каналы и менеджеры. */
import { SkCard, SkHeader, SkPage, SkStats, SkTable } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage>
      <SkHeader title="w-64" actions={1} />
      <SkStats n={6} />
      <div className="grid gap-6 lg:grid-cols-2">
        <SkCard lines={6} />
        <SkTable cols={4} rows={4} />
      </div>
      <SkTable cols={8} rows={4} />
    </SkPage>
  );
}
