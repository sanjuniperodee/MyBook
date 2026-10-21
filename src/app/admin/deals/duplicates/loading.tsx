/** Заготовка «Дублей сделок»: группы похожих сделок. */
import { SkCard, SkHeader, SkPage } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="mx-auto max-w-3xl space-y-5">
      <SkHeader back title="w-44" subtitle />
      <SkCard lines={4} />
      <SkCard lines={4} />
      <SkCard lines={4} />
    </SkPage>
  );
}
