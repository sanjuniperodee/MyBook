/** Заготовка «Сайта»: переключатель регистрации и реквизиты продавца. */
import { SkCard, SkForm, SkHeader, SkPage } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="mx-auto max-w-5xl">
      <SkHeader title="w-24" subtitle />
      <SkCard lines={3} />
      <SkForm fields={4} />
    </SkPage>
  );
}
