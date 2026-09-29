export default function Loading() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14" aria-busy="true" aria-label="Загружаем заказы">
      <div className="skeleton h-12 w-56" />
      <div className="mt-8 space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="skeleton h-20 rounded-3xl" />
        ))}
      </div>
    </main>
  );
}
