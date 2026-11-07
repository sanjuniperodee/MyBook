"use client";

import { RouteError } from "./RouteError";

export default function Error(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <RouteError {...props} title="Заказы не открылись" back={{ href: "/admin", label: "На главную CRM" }} />;
}
