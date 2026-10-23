/** Заготовка списка пользователей. */
import { SkHeader, SkPage, SkTable } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-5">
      <SkHeader title="w-44" subtitle />
      <SkTable cols={5} rows={8} />
    </SkPage>
  );
}
