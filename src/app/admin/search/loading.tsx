/** Заготовка поиска: строка запроса, указатель типов и листы результатов. */
import { SkHeader, SkPage, SkRows } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-5">
      <SkHeader title="w-40" />
      <div className="skeleton h-9 w-full max-w-xl rounded-[var(--r-ctl)]" />
      <div className="grid gap-8 lg:grid-cols-[11rem_minmax(0,1fr)]">
        <div className="skeleton hidden h-32 rounded-[var(--r-panel)] lg:block" />
        <div className="space-y-6">
          <SkRows rows={3} action={false} />
          <SkRows rows={2} action={false} />
        </div>
      </div>
    </SkPage>
  );
}
