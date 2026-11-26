import "server-only";
import { applyCatalog, applySeller, applySiteFlags, getSellerOverrides, missingSeller, sanitizeOverrides, type CatalogOverrides, type SellerDetails } from "@/config/site";
import { webApiClient } from "./api";

/** Подписи реквизитов продавца для предупреждения в лог. */
const SELLER_LABELS: Record<keyof SellerDetails, string> = { legalName: "юр. название", bin: "БИН", phone: "телефон", whatsapp: "WhatsApp" };

/**
 * Предупреждение в лог, пока реквизиты не заданы: на сайте (футер, оферта, сертификат, упаковочный лист) — заглушки.
 * Пишется один раз на процесс для каждого набора незаданных полей, а не каждые 10 секунд синхронизации.
 */
const warned = globalThis as unknown as { __mybookSellerWarned?: string };
function warnMissingSeller(overrides: Partial<SellerDetails>) {
  const missing = missingSeller(overrides);
  const key = missing.join(",");
  if (warned.__mybookSellerWarned === key) return;
  warned.__mybookSellerWarned = key;
  if (missing.length) console.warn(`[site] реквизиты продавца не заданы (${missing.map((k) => SELLER_LABELS[k]).join(", ")}): на сайте заглушки из src/config/site.ts — заполните в админке «Сайт»`);
}

/**
 * Цены, тарифы, переключатели сайта и реквизиты продавца из админки (ADR 0013): веб берёт их из API v1 (`webSiteCatalog`)
 * не чаще раза в 10 секунд и применяет к действующему каталогу (config/site.ts); ошибка не ломает сайт.
 */
export async function ensureCatalog() {
  return ensureCatalogViaApi();
}

const CATALOG_TTL_MS = 10_000;
const viaApi = globalThis as unknown as { __mybookCatalogAt?: number; __mybookCatalogLoad?: Promise<void> };

async function ensureCatalogViaApi() {
  if (viaApi.__mybookCatalogAt && Date.now() - viaApi.__mybookCatalogAt < CATALOG_TTL_MS) return;
  viaApi.__mybookCatalogLoad ??= (async () => {
    try {
      const s = await (await webApiClient({ sessionCookie: null })).webSiteCatalog({});
      applyCatalog(s.overrides ? sanitizeOverrides(s.overrides as CatalogOverrides) : null);
      applySiteFlags({ registration: s.registration, giftNote: s.giftNote });
      applySeller(s.seller);
      warnMissingSeller(getSellerOverrides());
      viaApi.__mybookCatalogAt = Date.now();
    } catch (err) {
      console.error("[catalog] не удалось получить цены из API v1", err);
    } finally {
      viaApi.__mybookCatalogLoad = undefined;
    }
  })();
  await viaApi.__mybookCatalogLoad;
}
