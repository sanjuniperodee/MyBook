/** Загрузка страницы сертификата: открытка слева, статус и оплата справа. */
export default function Loading() {
  return (
    <main className="pt-24 pb-20 sm:pt-32" aria-busy="true">
      <div className="container-x grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14">
        <div className="skeleton aspect-[210/148] w-full" />
        <div className="space-y-6">
          <div className="skeleton h-14 w-3/4" />
          <div className="skeleton h-32 w-full" />
          <div className="skeleton h-40 w-full rounded-[14px]" />
        </div>
      </div>
    </main>
  );
}
