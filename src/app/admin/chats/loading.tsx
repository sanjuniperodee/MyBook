/** Заготовка «Чатов»: страница занимает всю высоту окна, поэтому и заготовка — список слева и переписка справа. */
export default function Loading() {
  return (
    <div className="sk-delay crm-chat-root -mx-4 -my-5 flex overflow-hidden bg-white sm:-mx-6 lg:-my-8 lg:h-[calc(100dvh-3.5rem)]" aria-busy="true" aria-label="Загрузка">
      <div className="flex w-full shrink-0 flex-col border-r border-line bg-white lg:w-[360px]">
        <div className="space-y-3 px-4 pt-4">
          <div className="skeleton h-6 w-24" />
          <div className="skeleton h-10 w-full rounded-full" />
        </div>
        <div className="mt-4 space-y-1 px-2">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl px-2 py-3">
              <div className="skeleton size-11 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-3.5 w-2/5" />
                <div className="skeleton h-3 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="hidden flex-1 bg-[#f5f1eb] lg:block" />
    </div>
  );
}
