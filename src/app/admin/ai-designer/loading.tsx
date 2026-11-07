/** Заготовка статистики ИИ-дизайнера: период, показатели, графики и таблицы, настройки внизу. */
import { SkCard, SkHeader, SkPage, SkStats, SkTable, SkTabs } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage>
      <SkHeader title="w-40" subtitle />
      <SkTabs n={4} pills />
      <SkStats n={4} />
      <div className="grid gap-4 lg:grid-cols-2">
        <SkCard lines={5} />
        <SkCard lines={5} />
      </div>
      <SkTable cols={6} rows={4} />
    </SkPage>
  );
}
