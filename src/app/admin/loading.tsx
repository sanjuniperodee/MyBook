/**
 * Заготовка любого раздела CRM, пока сервер собирает страницу. Страницы админки зависят от входа, поэтому Next не может
 * подгрузить их заранее: без этого файла клик не давал ничего, пока страница не была собрана целиком. Меню и шапка
 * остаются на месте (они в layout), заготовка занимает только область содержимого.
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Загрузка">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-9 w-40" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-2xl border border-line bg-white p-5">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton mt-4 h-7 w-32" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-line bg-white p-5">
        <div className="skeleton h-5 w-40" />
        <div className="mt-5 space-y-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
