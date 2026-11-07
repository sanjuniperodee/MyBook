/** Загрузка отзыва: обложка слева, форма справа. */
export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-4 pt-10 pb-20 sm:px-6 sm:pt-14" aria-busy="true">
      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14">
        <div className="skeleton mb-6 aspect-[3/4] w-24 lg:mb-0 lg:w-44" />
        <div className="skeleton h-96 rounded-[14px]" />
      </div>
    </main>
  );
}
