/** Заготовка «Этапов воронки»: якоря слева, воронки и строки этапов справа. */
import { SkHeader, SkPage, SkRows, SkTabs } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="w-full max-w-5xl space-y-5">
      <SkHeader back title="w-52" subtitle />
      <div className="lg:grid lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-6">
        <div className="space-y-2 max-lg:hidden">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skeleton h-7 w-full rounded-lg" />
          ))}
        </div>
        <div className="min-w-0 space-y-5">
          <SkTabs n={2} pills />
          <SkRows rows={6} />
          <SkRows rows={4} action />
        </div>
      </div>
    </SkPage>
  );
}
