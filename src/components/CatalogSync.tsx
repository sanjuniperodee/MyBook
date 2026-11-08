"use client";

import { applyCatalog, applySeller, applySiteFlags, type CatalogOverrides, type SellerDetails, type SiteFlags } from "@/config/site";

/**
 * Передаёт браузеру цены, видимость тарифов, переключатели сайта (регистрация, открытка к заказу) и реквизиты продавца из админки: клиентские
 * компоненты (оформление заказа, сертификат, договорённость) считают цены и показывают контакты тем же кодом, что и сервер.
 * Рисуется первым в <body> — до остальных компонентов; повторный вызов с тем же значением ничего не делает.
 */
export function CatalogSync({ overrides, flags, seller }: { overrides: CatalogOverrides; flags: SiteFlags; seller: Partial<SellerDetails> }) {
  applyCatalog(overrides);
  applySiteFlags(flags);
  applySeller(seller);
  return null;
}
