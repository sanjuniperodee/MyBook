/** Заготовка «Ссылок и каналов»: показатели, короткие ссылки и таблица каналов. */
import { SkForm, SkHeader, SkPage, SkStats, SkTable, SkTabs } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage>
      <SkHeader title="w-52" subtitle />
      <SkTabs n={4} pills />
      <SkStats n={5} />
      <SkForm fields={3} />
      <SkTable cols={6} rows={6} />
    </SkPage>
  );
}
