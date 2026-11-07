/** Заготовка «Промокодов»: форма нового промокода и таблица. */
import { SkForm, SkHeader, SkPage, SkTable } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-5">
      <SkHeader title="w-40" subtitle />
      <SkForm fields={6} columns={2} />
      <SkTable cols={6} rows={6} />
    </SkPage>
  );
}
