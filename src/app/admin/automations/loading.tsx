/** Заготовка «Автоматизаций»: группы «Работают» и «Выключены» со строками правил. */
import { SkHeader, SkPage, SkRows } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="mx-auto max-w-5xl">
      <SkHeader title="w-48" subtitle />
      <div className="space-y-3">
        <div className="skeleton h-4 w-28" />
        <SkRows rows={5} avatar />
      </div>
    </SkPage>
  );
}
