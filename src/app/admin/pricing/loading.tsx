/** Заготовка «Цен и тарифов»: тарифы, допы и доставка. */
import { SkCard, SkForm, SkHeader, SkPage } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="mx-auto max-w-5xl">
      <SkHeader title="w-52" subtitle />
      <SkCard>
        <div className="space-y-4">
          <SkForm fields={2} button={false} />
          <SkForm fields={2} button={false} />
        </div>
      </SkCard>
      <SkForm fields={2} />
    </SkPage>
  );
}
