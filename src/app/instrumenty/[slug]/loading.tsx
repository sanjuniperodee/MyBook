/** Загрузка инструмента: титр и рабочий лист из двух колонок. */
export default function Loading() {
  return (
    <main className="pt-24 pb-20 sm:pt-32" aria-busy="true">
      <div className="container-x space-y-6">
        <div className="skeleton h-14 w-full max-w-2xl" />
        <div className="skeleton h-20 w-full max-w-2xl" />
        <div className="skeleton mt-6 h-[28rem] rounded-[14px]" />
      </div>
    </main>
  );
}
