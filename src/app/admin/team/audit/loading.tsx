/** Заготовка «Журнала действий». */
import { SkPage, SkTable } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage>
      <SkTable cols={4} rows={10} />
    </SkPage>
  );
}
