/** Заготовка «Интеграций»: меню разделов слева и карточки настроек. */
import { SkCard, SkHeader, SkPage } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="mx-auto max-w-5xl space-y-5">
      <SkHeader title="w-72" subtitle />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
        <div className="hidden space-y-3 md:block">
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
