/** Заготовка «Шаблонов»: шапка и карточки. */
import { SkHeader, SkPage } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="max-w-5xl space-y-5">
      <SkHeader title="w-40" subtitle />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton h-36 rounded-2xl" />
        ))}
      </div>
    </SkPage>
  );
}
