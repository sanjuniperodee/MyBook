/** Заготовка «Сделок»: шапка, панель инструментов (вид, чипы, поиск) и колонки доски. */
import { SkBoard, SkHeader, SkPage } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-4">
      <SkHeader title="w-36" actions={2} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="skeleton h-9 w-44 rounded-[var(--r-ctl)]" />
        <div className="flex flex-1 gap-2 max-lg:hidden">
          {[20, 16, 28, 24].map((w, i) => (
            <div key={i} className="skeleton h-9 rounded-[var(--r-ctl)]" style={{ width: `${w * 4}px` }} />
          ))}
        </div>
        <div className="skeleton h-9 w-64 rounded-[var(--r-ctl)] max-lg:w-full" />
      </div>
      <SkBoard columns={4} cards={3} />
    </SkPage>
  );
}
