import "server-only";
import { applyCatalog, applySeller, applySiteFlags, getCatalogOverrides, getSellerOverrides, missingSeller, sanitizeOverrides, sanitizeSeller, type CatalogOverrides, type SellerDetails } from "@/config/site";
import { deleteSetting, getSetting, getSettings, saveSettings } from "@/modules/workspace";
import { webApiClient, webApiOnly } from "./v1-web-client";

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
 * Цены, тарифы, переключатели сайта (регистрация, открытка к заказу) и реквизиты продавца, заданные в админке, подтягиваются из настроек
 * в действующий каталог (config/site.ts). Настройки кэшируются на 10 секунд, поэтому вызов дешёвый; ошибка чтения не ломает
 * сайт — остаются прежние значения.
 */
export async function ensureCatalog() {
  // Сайт без БД (Vercel): те же настройки берём из API v1, не чаще раза в 10 секунд.
  if (webApiOnly()) return ensureCatalogViaApi();
  try {
    const raw = await getSetting("catalog.overrides");
    applyCatalog(raw ? sanitizeOverrides(JSON.parse(raw)) : null);
    const [registration, giftNote] = await Promise.all([getSetting("site.registration"), getSetting("site.giftNote")]);
    applySiteFlags({ registration: registration !== "off", giftNote: giftNote !== "off" });
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

/** Настройки каталога как есть — для сайта без БД (API v1 webSiteCatalog); применяет их ensureCatalogViaApi. */
export async function readCatalogSettings() {
  const [raw, registration, giftNote, seller] = await Promise.all([getSetting("catalog.overrides"), getSetting("site.registration"), getSetting("site.giftNote"), readSeller()]);
  let overrides: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    overrides = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    overrides = null;
  }
  return { overrides, registration: registration !== "off", giftNote: giftNote !== "off", seller };
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

/** Включить или выключить открытку к заказу на сайте; действует сразу в этом процессе. */
export async function saveGiftNote(enabled: boolean, actorId: string | null) {
  await saveSettings({ "site.giftNote": enabled ? "on" : "off" }, actorId);
  applySiteFlags({ giftNote: enabled });
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
