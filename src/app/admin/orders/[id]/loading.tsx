/** Заготовка карточки заказа: файлы, книга и клиент слева, оплата справа. */
import { SkCard, SkHeader, SkPage, SkStats, SkTwoCol } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage>
      <SkHeader back title="w-48" actions={2} />
      <SkTwoCol
        sideWidth="24rem"
        main={
          <>
            <SkCard lines={2} />
            <SkStats n={4} />
            <SkCard lines={6} />
            <SkCard lines={4} />
          </>
        }
        side={
          <>
            <SkCard lines={2} />
            <SkCard lines={6} />
            <SkCard lines={4} />
          </>
        }
      />
    </SkPage>
  );
}
