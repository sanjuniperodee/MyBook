import "server-only";
import { applyCatalog, applySeller, applySiteFlags, getCatalogOverrides, getSellerOverrides, missingSeller, sanitizeOverrides, sanitizeSeller, type CatalogOverrides, type SellerDetails } from "@/config/site";
import { deleteSetting, getSetting, getSettings, saveSettings } from "@/modules/workspace";

/** Ключи настроек реквизитов продавца. WhatsApp магазина — общий с рекламными ссылками (crm.whatsappNumber). */
const SELLER_KEYS = { legalName: "site.legalName", bin: "site.bin", phone: "site.phone", whatsapp: "crm.whatsappNumber" } as const satisfies Record<keyof SellerDetails, string>;
const SELLER_LABELS: Record<keyof SellerDetails, string> = { legalName: "юр. название", bin: "БИН", phone: "телефон", whatsapp: "WhatsApp" };

/** Реквизиты продавца из настроек; ошибка чтения не ломает сайт — остаются прежние значения. */
async function readSeller(): Promise<Record<keyof SellerDetails, string>> {
  const s = await getSettings(Object.values(SELLER_KEYS));
  return { legalName: s[SELLER_KEYS.legalName], bin: s[SELLER_KEYS.bin], phone: s[SELLER_KEYS.phone], whatsapp: s[SELLER_KEYS.whatsapp] };
}

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
 * Цены, тарифы, переключатели сайта (регистрация) и реквизиты продавца, заданные в админке, подтягиваются из настроек
 * в действующий каталог (config/site.ts). Настройки кэшируются на 10 секунд, поэтому вызов дешёвый; ошибка чтения не ломает
 * сайт — остаются прежние значения.
 */
export async function ensureCatalog() {
  try {
    const raw = await getSetting("catalog.overrides");
    applyCatalog(raw ? sanitizeOverrides(JSON.parse(raw)) : null);
    applySiteFlags({ registration: (await getSetting("site.registration")) !== "off" });
  } catch (err) {
    console.error("[catalog] не удалось прочитать цены из настроек", err);
  }
  try {
    applySeller(await readSeller());
    warnMissingSeller(getSellerOverrides());
  } catch (err) {
    console.error("[catalog] не удалось прочитать реквизиты продавца из настроек", err);
  }
}

/** Сохранить цены из админки (null — вернуть заводские) и сразу применить их в этом процессе. */
export async function saveCatalog(overrides: CatalogOverrides | null, actorId: string | null) {
  const clean = overrides ? sanitizeOverrides(overrides) : null;
  if (clean && Object.keys(clean).length) await saveSettings({ "catalog.overrides": JSON.stringify(clean) }, actorId);
  else await deleteSetting("catalog.overrides");
  applyCatalog(clean);
  return getCatalogOverrides();
}

/** Открыть или закрыть регистрацию на сайте; действует сразу в этом процессе. */
export async function saveRegistration(open: boolean, actorId: string | null) {
  await saveSettings({ "site.registration": open ? "on" : "off" }, actorId);
  applySiteFlags({ registration: open });
}

/** Сохранить реквизиты продавца (пустое поле — вернуть заглушку) и сразу применить их в этом процессе. */
export async function saveSeller(values: Partial<SellerDetails>, actorId: string | null) {
  const clean = sanitizeSeller(values);
  await saveSettings({ [SELLER_KEYS.legalName]: clean.legalName ?? "", [SELLER_KEYS.bin]: clean.bin ?? "", [SELLER_KEYS.phone]: clean.phone ?? "", [SELLER_KEYS.whatsapp]: clean.whatsapp ?? "" }, actorId);
  applySeller(clean);
  warnMissingSeller(clean);
  return clean;
}

/** Фоновое обновление: изменения из другого процесса подхватываются за пару секунд, без запроса пользователя. */
export function startCatalogSync() {
  void ensureCatalog();
  const timer = setInterval(() => void ensureCatalog(), 10_000);
  timer.unref?.();
}
