import { SkHeader, SkPage } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="max-w-3xl space-y-4">
      <SkHeader title="w-48" subtitle />
      <div className="skeleton h-40 rounded-2xl" />
      <div className="skeleton h-32 rounded-2xl" />
    </SkPage>
  );
}
