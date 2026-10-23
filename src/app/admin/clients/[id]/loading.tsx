/** Заготовка карточки клиента: профиль слева, сделки, платежи, книги и задачи справа. */
import { SkCard, SkHeader, SkPage, SkRows, SkTwoCol } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage>
      <SkHeader back title="w-64" />
      <SkTwoCol
        sideWidth="22rem"
        main={
          <>
            <SkCard>
              <div className="flex items-center gap-4">
                <div className="skeleton size-14 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-5 w-40" />
                  <div className="skeleton h-3.5 w-56" />
                </div>
              </div>
            </SkCard>
            <SkCard lines={5} />
            <SkRows rows={3} />
          </>
        }
        side={
          <>
            <SkCard lines={6} />
            <SkCard lines={3} />
          </>
        }
      />
    </SkPage>
  );
}
