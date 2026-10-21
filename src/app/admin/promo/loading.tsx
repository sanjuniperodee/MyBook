/** Заготовка «Промокодов»: форма нового промокода и таблица. */
import { SkForm, SkHeader, SkPage, SkTable } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage>
      <SkHeader title="w-40" />
      <SkForm fields={5} />
      <SkTable cols={6} rows={6} />
    </SkPage>
  );
}
