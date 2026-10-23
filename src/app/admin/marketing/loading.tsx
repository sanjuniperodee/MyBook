/** Заготовка «Ссылок и каналов»: показатели, короткие ссылки и таблица каналов. */
import { SkForm, SkHeader, SkPage, SkStats, SkTable } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage>
      <SkHeader title="w-52" subtitle actions={1} />
      <SkStats n={4} />
      <SkForm fields={3} />
      <SkTable cols={6} rows={6} />
    </SkPage>
  );
}
