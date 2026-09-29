"use client";

import { useEffect } from "react";
import { trackOnce } from "@/lib/analytics-client";

/** Отправляет цель один раз на браузер — например, оплату при первом открытии страницы оплаченного заказа. */
export function TrackOnce({ id, name, value }: { id: string; name: string; value?: number }) {
  useEffect(() => {
    const t = setTimeout(() => trackOnce(id, name, value), 1500);
    return () => clearTimeout(t);
  }, [id, name, value]);
  return null;
}
