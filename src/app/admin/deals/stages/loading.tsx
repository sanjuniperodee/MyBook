/** Заготовка «Этапов воронки»: воронки и строки этапов. */
import { SkHeader, SkPage, SkRows, SkTabs } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="mx-auto max-w-2xl space-y-5">
      <SkHeader back title="w-52" subtitle />
      <SkTabs n={2} pills />
      <SkRows rows={6} />
    </SkPage>
  );
}
