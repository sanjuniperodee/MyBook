/** Заготовка «Сертификатов»: плитки и таблица подарочных сертификатов. */
import { SkHeader, SkPage, SkStats, SkTable } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage>
      <SkHeader title="w-44" subtitle />
      <SkStats n={3} />
      <SkTable cols={6} rows={6} />
    </SkPage>
  );
}
