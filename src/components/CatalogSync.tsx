"use client";

import { applyCatalog, type CatalogOverrides } from "@/config/site";

/**
 * Передаёт браузеру цены и видимость тарифов из админки: клиентские компоненты (оформление заказа, сертификат)
 * считают цены тем же кодом, что и сервер. Рисуется первым в <body> — до остальных компонентов; повторный вызов с тем же значением ничего не делает.
 */
export function CatalogSync({ overrides }: { overrides: CatalogOverrides }) {
  applyCatalog(overrides);
  return null;
}
