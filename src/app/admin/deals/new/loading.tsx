/** Заготовка формы «Новая сделка». */
import { SkForm, SkHeader, SkPage } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="mx-auto max-w-2xl space-y-5">
      <SkHeader back title="w-44" />
      <SkForm fields={8} />
    </SkPage>
  );
}
