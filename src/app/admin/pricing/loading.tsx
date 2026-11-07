/** Заготовка «Цен и тарифов» («Настройки»): якоря разделов слева, справа форма до 640 px — листы с рядами полей. */
import { Bar, SkHeader, SkPage } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-5 lg:space-y-6">
      <SkHeader title="w-52" subtitle />
      <div className="grid items-start gap-4 lg:grid-cols-[11rem_minmax(0,40rem)] lg:gap-8">
        <div className="flex gap-2 lg:flex-col">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="skeleton h-8 w-28 shrink-0 lg:w-32" />
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, s) => (
            <div key={s} className="panel overflow-hidden">
              <div className="border-b border-line px-4 py-3 sm:px-5">
                <div className="skeleton h-4 w-32" />
              </div>
              <div className="divide-y divide-line">
                {Array.from({ length: 2 }, (_, r) => (
                  <div key={r} className="space-y-3 px-4 py-4 sm:px-5">
                    <Bar className="w-40" />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="skeleton h-10 w-full" />
                      <div className="skeleton h-10 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="skeleton h-14 w-full" />
        </div>
      </div>
    </SkPage>
  );
}
