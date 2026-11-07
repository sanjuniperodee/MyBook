/** Заготовка «Сертификатов»: шапка, показатели одной строкой и таблица сертификатов. */
import { SkHeader, SkPage, SkStats, SkTable } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-5">
      <SkHeader title="w-64" subtitle actions={1} />
      <SkStats n={4} />
      <SkTable cols={6} rows={6} />
    </SkPage>
  );
}
