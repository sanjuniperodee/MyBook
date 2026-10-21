/** Заготовка карточки сделки: этапы, поля и задачи слева, переписка справа. */
import { SkCard, SkForm, SkHeader, SkPage, SkTabs, SkTwoCol } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-5">
      <SkHeader back title="w-80" />
      <SkTabs n={6} pills />
      <SkTwoCol
        sideWidth="28rem"
        main={
          <>
            <SkForm fields={8} />
            <SkCard lines={3} />
          </>
        }
        side={<SkCard lines={9} />}
      />
    </SkPage>
  );
}
