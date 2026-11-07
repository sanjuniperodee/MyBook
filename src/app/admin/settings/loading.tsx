/** Заготовка «Интеграций»: меню разделов слева и карточки настроек. */
import { SkCard, SkHeader, SkPage } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="mx-auto max-w-6xl space-y-6">
      <SkHeader title="w-72" subtitle />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
        <div className="hidden space-y-3 lg:block">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="skeleton h-10 w-full" />
          ))}
        </div>
        <div className="min-w-0 space-y-4">
          <SkCard lines={6} />
          <SkCard lines={1} />
          <SkCard lines={1} />
        </div>
      </div>
    </SkPage>
  );
}
