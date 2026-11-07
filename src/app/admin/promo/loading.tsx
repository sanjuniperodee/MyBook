/** Заготовка «Промокодов»: итоги одной строкой и ведомость кодов. */
import { SkHeader, SkPage, SkTable } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-5">
      <SkHeader title="w-40" subtitle actions={1} />
      <div className="skeleton h-16 rounded-[var(--r-panel)]" />
      <SkTable cols={6} rows={5} />
    </SkPage>
  );
}
