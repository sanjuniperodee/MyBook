/** Загрузка проверки кода: титр и поле ввода. */
export default function Loading() {
  return (
    <main className="pt-28 pb-24 sm:pt-40" aria-busy="true">
      <div className="container-x max-w-xl space-y-5">
        <div className="skeleton h-16 w-4/5" />
        <div className="skeleton h-6 w-full" />
        <div className="skeleton h-14 w-full" />
      </div>
    </main>
  );
}
