/** Заготовка «Ролей и прав»: список ролей и редактор выбранной. */
import { SkCard, SkPage } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-5">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="hidden space-y-2 md:block">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="skeleton h-9 w-full" />
          ))}
        </div>
        <SkCard lines={10} />
      </div>
    </SkPage>
  );
}
