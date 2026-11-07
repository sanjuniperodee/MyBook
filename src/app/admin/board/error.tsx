"use client";

import { RouteError } from "../orders/RouteError";

export default function Error(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <RouteError {...props} title="Производство не открылось" back={{ href: "/admin/orders", label: "К списку заказов" }} />;
}
