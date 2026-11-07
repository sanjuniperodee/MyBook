"use client";

import { RouteError } from "../orders/RouteError";

export default function Error(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <RouteError {...props} title="Цены и тарифы не открылись" back={{ href: "/admin", label: "На главную CRM" }} />;
}
