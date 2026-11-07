/** Заготовка формы «Новый клиент»: колонка до 640 px, группы полей. */
import { SkForm, SkHeader, SkPage } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="mx-auto w-full max-w-[40rem] space-y-5">
      <SkHeader back title="w-44" subtitle />
      <SkForm fields={8} />
      <SkForm fields={4} />
    </SkPage>
  );
}
