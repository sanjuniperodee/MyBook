import "server-only";
import { applyCatalog, getCatalogOverrides, sanitizeOverrides, type CatalogOverrides } from "@/config/site";
import { deleteSetting, getSetting, saveSettings } from "@/modules/workspace";

/**
 * Цены и тарифы, заданные в админке, подтягиваются из настроек в действующий каталог (config/site.ts).
 * Настройки кэшируются на 10 секунд, поэтому вызов дешёвый; ошибка чтения не ломает сайт — остаются прежние цены.
 */
export async function ensureCatalog() {
  try {
    const raw = await getSetting("catalog.overrides");
    applyCatalog(raw ? sanitizeOverrides(JSON.parse(raw)) : null);
  } catch (err) {
    console.error("[catalog] не удалось прочитать цены из настроек", err);
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

/** Фоновое обновление: изменения из другого процесса подхватываются за пару секунд, без запроса пользователя. */
export function startCatalogSync() {
  void ensureCatalog();
  const timer = setInterval(() => void ensureCatalog(), 10_000);
  timer.unref?.();
}
