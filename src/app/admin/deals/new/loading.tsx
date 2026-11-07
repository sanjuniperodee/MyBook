/** Заготовка формы «Новая сделка»: колонка до 640 px, три группы полей. */
import { SkForm, SkHeader, SkPage } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="w-full max-w-[40rem] space-y-5">
      <SkHeader back title="w-44" subtitle />
      <SkForm fields={5} />
      <SkForm fields={3} button={false} />
      <SkForm fields={2} />
    </SkPage>
  );
}
