/**
 * Снимки коллекции для слоёв обложки (assets/cover-photos, лицензии — в covers/photo и sample-photos.ts): люди — пока
 * клиент не поставил свои фото, фактуры и пейзажи — как фон или иллюстрация.
 */
export type StockGroup = "people" | "flowers" | "nature" | "texture";

export const stockPhotos: Record<string, StockGroup> = {
  couple: "people",
  autumnlove: "people",
  sunsetwalk: "people",
  weddingbeach: "people",
  weddingstairs: "people",
  bouquethands: "people",
  weddingbw: "people",
  family: "people",
  daddy: "people",
  familydusk: "people",
  mamahug: "people",
  newborn: "people",
  friends: "people",
  laughter: "people",
  peony: "flowers",
  roses: "flowers",
  bouquet: "flowers",
  dried: "flowers",
  eucalyptus: "flowers",
  lavender: "flowers",
  sakura: "flowers",
  tenderness: "flowers",
  meadow: "nature",
  alatau: "nature",
  peaks: "nature",
  steppe: "nature",
  mist: "nature",
  surf: "nature",
  autumn: "nature",
  clouds: "nature",
  milkyway: "nature",
  dusk: "nature",
  lights: "texture",
  flax: "texture",
  marble: "texture",
  velvet: "texture",
  saddle: "texture",
  mint: "texture",
  postcards: "texture",
  party: "texture",
};

export const stockGroups: StockGroup[] = ["people", "flowers", "nature", "texture"];

export const isStockPhoto = (key: string) => Object.hasOwn(stockPhotos, key);
