/** Каталог оформлений: порядок в выборе, поиск по id, пары к обложкам. */
import { airmail } from "./collection/airmail";
import { album } from "./collection/album";
import { arches } from "./collection/arches";
import { cinema } from "./collection/cinema";
import { confetti } from "./collection/confetti";
import { deco } from "./collection/deco";
import { editorial } from "./collection/editorial";
import { gallery } from "./collection/gallery";
import { herbarium } from "./collection/herbarium";
import { luna } from "./collection/luna";
import { memories } from "./collection/memories";
import { mountains } from "./collection/mountains";
import { oyu } from "./collection/oyu";
import { photobook } from "./collection/photobook";
import { romance } from "./collection/romance";
import { sea } from "./collection/sea";
import { shanyrak } from "./collection/shanyrak";
import { stars } from "./collection/stars";
import { vintage } from "./collection/vintage";
import { watercolor } from "./collection/watercolor";
import { classic, minimal, modern } from "./legacy";
import type { InteriorDesign, InteriorId } from "./types";

export const byId: Record<InteriorId, InteriorDesign> = {
  classic,
  modern,
  minimal,
  romance,
  stars,
  oyu,
  herbarium,
  deco,
  editorial,
  airmail,
  watercolor,
  shanyrak,
  mountains,
  sea,
  vintage,
  album,
  confetti,
  photobook,
  memories,
  gallery,
  arches,
  cinema,
  luna,
};

/** Порядок в выборе: сначала спокойная классика, дальше чередуем настроения. */
export const interiorDesigns: InteriorDesign[] = (
  [
    "classic", "photobook", "gallery", "romance", "cinema", "stars", "memories", "arches", "herbarium", "oyu", "luna", "editorial",
    "watercolor", "shanyrak", "mountains", "deco", "album", "sea", "airmail", "vintage", "confetti", "modern", "minimal",
  ] as const
).map((id) => byId[id]);

export const DEFAULT_INTERIOR: InteriorId = "classic";

export function isInteriorId(id: string): id is InteriorId {
  return Object.hasOwn(byId, id);
}

export function getInteriorDesign(id: string): InteriorDesign {
  return isInteriorId(id) ? byId[id] : byId[DEFAULT_INTERIOR];
}

/** Дизайны в пару к обложке — для подсказки «к вашей обложке». */
export function interiorsForCover(coverId: string): InteriorDesign[] {
  return interiorDesigns.filter((d) => d.pairsWith.includes(coverId));
}
