import { SkHeader, SkPage } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="space-y-5">
      <SkHeader back title="w-32" subtitle />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4 xl:max-w-[760px]">
          <div className="skeleton h-44 rounded-[var(--r-panel)]" />
          <div className="skeleton h-28 rounded-[var(--r-panel)]" />
        </div>
        <div className="skeleton h-64 rounded-[var(--r-panel)]" />
      </div>
    </SkPage>
  );
}
