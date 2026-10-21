/** Заготовка формы «Новый клиент». */
import { SkForm, SkHeader, SkPage } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="mx-auto max-w-2xl space-y-5">
      <SkHeader back title="w-44" subtitle />
      <SkForm fields={8} />
      <SkForm fields={4} />
    </SkPage>
  );
}
