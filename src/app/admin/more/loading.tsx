/** Заготовка «Ещё» на телефоне: крупный заголовок, профиль и списки разделов. */
import { Bar, SkPage } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="mx-auto max-w-xl space-y-6">
      <div className="skeleton h-9 w-24" />
      <div className="flex items-center gap-3 rounded-[var(--r-panel)] border border-line bg-white p-4">
        <div className="skeleton size-12 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Bar className="w-40" />
          <Bar className="h-3 w-24 opacity-70" />
        </div>
      </div>
      {[3, 4].map((n) => (
        <div key={n} className="divide-y divide-line overflow-hidden rounded-[var(--r-panel)] border border-line bg-white">
          {Array.from({ length: n }, (_, i) => (
            <div key={i} className="flex min-h-12 items-center gap-3 px-4 py-2">
              <div className="skeleton size-7 shrink-0 rounded-[7px]" />
              <Bar className="w-32" />
            </div>
          ))}
        </div>
      ))}
    </SkPage>
  );
}
