"use client";

import { applyCatalog, applySiteFlags, type CatalogOverrides } from "@/config/site";

/**
 * Передаёт браузеру цены, видимость тарифов и переключатели сайта (регистрация) из админки: клиентские компоненты (оформление заказа, сертификат)
 * считают цены тем же кодом, что и сервер. Рисуется первым в <body> — до остальных компонентов; повторный вызов с тем же значением ничего не делает.
 */
export function CatalogSync({ overrides, registration }: { overrides: CatalogOverrides; registration: boolean }) {
  applyCatalog(overrides);
  applySiteFlags({ registration });
  return null;
}
