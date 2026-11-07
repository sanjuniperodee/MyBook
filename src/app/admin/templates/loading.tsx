/** Заготовка «Шаблонов»: шапка, поиск и лист со строками шаблонов. */
import { SkHeader, SkPage, SkRows } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="max-w-5xl space-y-6">
      <SkHeader title="w-48" subtitle />
      <div className="flex gap-3">
        <div className="skeleton h-10 w-full max-w-sm rounded-[10px]" />
        <div className="skeleton ml-auto h-10 w-36 rounded-[10px]" />
      </div>
      <SkRows rows={6} />
    </SkPage>
  );
}
