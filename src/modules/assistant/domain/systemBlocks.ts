/**
 * Системная инструкция для провайдера с кэшем префикса (Claude): стабильное начало — отдельным блоком с меткой кэша,
 * остальное — следом. Чистая функция: префикс должен быть именно началом инструкции, иначе инструкция уходит одним блоком.
 */
export function systemBlocks(system: string, cachePrefix?: string | null): { text: string; cached: boolean }[] {
  if (!cachePrefix || cachePrefix.length < 200 || !system.startsWith(cachePrefix)) return [{ text: system, cached: false }];
  const rest = system.slice(cachePrefix.length);
  return rest.trim() ? [{ text: cachePrefix, cached: true }, { text: rest, cached: false }] : [{ text: cachePrefix, cached: true }];
}
