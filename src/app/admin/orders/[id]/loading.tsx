/** Заготовка карточки заказа: шапка, линейка производства с фактами, слева оплата, книга и доставка, справа липкий контекст. */
import { Bar, SkCard, SkHeader, SkPage } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-4 lg:space-y-5">
      <SkHeader back title="w-48" actions={2} />
      <div className="panel overflow-hidden">
        <div className="space-y-3 px-4 py-5 sm:px-5">
          <div className="flex items-center gap-2 sm:hidden">
            <Bar className="w-32" />
            <Bar className="ml-auto h-3 w-16" />
          </div>
          <div className="hidden gap-4 sm:flex">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex-1 space-y-2">
                <div className="skeleton size-3.5 rounded-full" />
                <Bar className="w-20" />
                <Bar className="h-3 w-12 opacity-70" />
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-line bg-line lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-2 bg-white px-4 py-3 sm:px-5">
              <Bar className="h-3 w-16" />
              <div className="skeleton h-5 w-28" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_23rem] xl:gap-5">
        <div className="space-y-4 xl:space-y-5">
          <SkCard lines={5} />
          <SkCard lines={6} />
          <SkCard lines={4} />
        </div>
        <div className="space-y-4 xl:space-y-5">
          <SkCard lines={3} />
          <SkCard lines={4} />
          <SkCard lines={3} />
        </div>
      </div>
    </SkPage>
  );
}
