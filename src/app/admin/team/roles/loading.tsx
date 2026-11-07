/** Заготовка «Ролей и прав»: список ролей слева и матрица прав выбранной. */
import { Bar, SkPage } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-4">
      <Bar className="h-3 w-3/4 max-w-xl" />
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
        <div className="hidden space-y-2 lg:block">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="skeleton h-9 w-full" />
          ))}
        </div>
        <div className="panel space-y-5 p-5">
          <div className="skeleton h-9 w-72" />
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="skeleton h-16" />
            <div className="skeleton h-16" />
          </div>
          <div className="skeleton h-9 w-64" />
          <div className="grid gap-4 xl:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="skeleton h-40" />
            ))}
          </div>
        </div>
      </div>
    </SkPage>
  );
}
