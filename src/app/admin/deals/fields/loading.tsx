/** Заготовка «Полей сделки»: список своих полей и форма нового. */
import { SkForm, SkHeader, SkPage, SkRows } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="mx-auto max-w-2xl space-y-5">
      <SkHeader back title="w-40" subtitle />
      <SkRows rows={4} />
      <SkForm fields={3} />
    </SkPage>
  );
}
