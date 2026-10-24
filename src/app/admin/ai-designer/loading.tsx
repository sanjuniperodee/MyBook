/** Заготовка статистики ИИ-дизайнера: период, лимит, показатели и таблицы. */
import { SkCard, SkHeader, SkPage } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="mx-auto max-w-6xl">
      <SkHeader title="w-40" subtitle />
      <SkCard>
        <div className="h-16" />
      </SkCard>
      <SkCard>
        <div className="h-40" />
      </SkCard>
      <SkCard>
        <div className="h-64" />
      </SkCard>
    </SkPage>
  );
}
