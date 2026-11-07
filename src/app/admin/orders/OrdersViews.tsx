import { List, SquareKanban } from "lucide-react";
import { Segmented } from "@/components/admin/Segmented";

/** Вид заказов — список (фильтры, массовые действия) или производство (канбан по статусам): один переключатель на обоих экранах. */
export function OrdersViews({ active }: { active: "list" | "board" }) {
  return (
    <Segmented
      label="Вид заказов"
      items={[
        {
          key: "list",
          href: "/admin/orders",
          active: active === "list",
          label: (
            <span className="inline-flex items-center gap-1.5">
              <List className="size-4" aria-hidden /> Список
            </span>
          ),
        },
        {
          key: "board",
          href: "/admin/board",
          active: active === "board",
          label: (
            <span className="inline-flex items-center gap-1.5">
              <SquareKanban className="size-4" aria-hidden /> Производство
            </span>
          ),
        },
      ]}
    />
  );
}
