/** Загрузка страницы оплаты: квитанция слева и блок способов справа — те же пропорции, что у готовой страницы. */
export default function Loading() {
  return (
    <main className="pt-24 pb-20 sm:pt-32" aria-busy="true">
      <div className="container-x max-w-5xl">
        <div className="skeleton h-12 w-3/4 max-w-md" />
        <div className="mt-8 grid gap-8 lg:mt-12 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-14">
          <div className="skeleton h-72 rounded-[14px]" />
          <div className="skeleton h-64 rounded-[14px]" />
        </div>
      </div>
    </main>
  );
}
