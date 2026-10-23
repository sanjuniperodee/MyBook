/** Заготовка «Безопасности»: двухфакторный вход, список адресов и 2FA сотрудников. */
import { SkCard, SkHeader, SkPage, SkRows } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <SkPage className="mx-auto max-w-5xl">
      <SkHeader title="w-44" subtitle />
      <SkCard lines={3} />
      <SkCard lines={4} />
      <SkRows rows={4} action />
    </SkPage>
  );
}
