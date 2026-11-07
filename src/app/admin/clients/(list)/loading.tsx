/** Заготовка «Клиентов»: шапка, сегменты, поиск и таблица. */
import { SkHeader, SkPage, SkTable, SkTabs } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-4">
      <SkHeader title="w-36" actions={2} />
      <SkTabs n={6} pills />
      <div className="skeleton h-9 w-full max-w-96 rounded-[10px]" />
      <SkTable cols={6} rows={8} check />
    </SkPage>
  );
}
