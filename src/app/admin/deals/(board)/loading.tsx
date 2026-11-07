/** Заготовка «Сделок»: шапка, вид и поиск, чипы фильтров и доска воронки. */
import { SkBoard, SkHeader, SkPage, SkTabs } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-4">
      <SkHeader title="w-36" actions={2} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="skeleton h-10 w-44 rounded-xl" />
        <div className="skeleton h-9 w-full max-w-96 rounded-[10px]" />
      </div>
      <SkTabs n={6} pills />
      <SkBoard columns={4} cards={4} />
    </SkPage>
  );
}
