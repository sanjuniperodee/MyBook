/** Заготовка «Безопасности»: обзор защиты и листы 2FA, правил и сотрудников. */
import { Bar, SkHeader, SkPage } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="mx-auto max-w-6xl space-y-5">
      <SkHeader title="w-44" subtitle />
      <div className="panel divide-y divide-line">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-3 px-5 py-3.5">
            <div className="space-y-2">
              <div className="skeleton h-4 w-44" />
              <Bar className="h-3 w-72 max-w-full" />
            </div>
            <div className="skeleton h-7 w-28" />
          </div>
        ))}
      </div>
      <div className="grid gap-x-8 gap-y-4 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
        <div className="hidden space-y-2.5 lg:block">
          {Array.from({ length: 3 }, (_, i) => (
            <Bar key={i} className="h-4 w-32" />
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="panel flex items-center justify-between px-5 py-3.5">
              <div className="skeleton h-4 w-52" />
              <div className="skeleton h-7 w-24" />
            </div>
          ))}
        </div>
      </div>
    </SkPage>
  );
}
