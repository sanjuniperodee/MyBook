/** Заготовка карточки клиента: шапка с цифрами; слева профиль и вкладки, справа — история. */
import { Bar, SkCard, SkPage, SkRows, SkStats } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-5">
      <Bar className="h-3 w-20" />
      <div className="overflow-hidden rounded-[var(--r-panel)] border border-line bg-white">
        <div className="flex items-center gap-4 p-5">
          <div className="skeleton size-14 rounded-full" />
          <div className="space-y-2">
            <div className="skeleton h-7 w-56" />
            <Bar className="w-40" />
          </div>
        </div>
        <SkStats n={4} className="rounded-none border-x-0 border-b-0" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,47rem)_minmax(20rem,1fr)]">
        <div className="min-w-0 space-y-5">
          <SkCard lines={6} />
          <SkRows rows={4} />
        </div>
        <div className="min-w-0">
          <SkCard lines={8} />
        </div>
      </div>
    </SkPage>
  );
}
