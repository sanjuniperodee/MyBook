/** Заготовка отчёта: шапка, период, строка показателей, ведомость. */
import { SkHeader, SkPage, SkStats, SkTable } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage>
      <SkHeader title="w-48" subtitle actions={1} />
      <div className="skeleton h-8 w-80 rounded-[var(--r-ctl)]" />
      <SkStats n={4} />
      <SkTable cols={7} rows={8} />
    </SkPage>
  );
}
