/** Заготовка «Сайта»: якоря слева, листы регистрации, реквизитов и приложения. */
import { Bar, SkHeader, SkPage } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="mx-auto max-w-6xl space-y-5">
      <SkHeader title="w-24" subtitle />
      <div className="grid gap-x-8 gap-y-4 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
        <div className="hidden space-y-2.5 lg:block">
          {Array.from({ length: 3 }, (_, i) => (
            <Bar key={i} className="h-4 w-36" />
          ))}
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="panel">
              <div className="flex items-center justify-between px-5 py-3.5">
                <div className="space-y-2">
                  <div className="skeleton h-4 w-48" />
                  <Bar className="h-3 w-72 max-w-full" />
                </div>
                <div className="skeleton h-7 w-20" />
              </div>
              {i === 1 ? <div className="skeleton m-5 mt-0 h-14 max-w-[40rem]" /> : null}
            </div>
          ))}
        </div>
      </div>
    </SkPage>
  );
}
