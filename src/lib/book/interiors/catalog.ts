/** Каталог оформлений: порядок в выборе, поиск по id, пары к обложкам. */
import { airmail } from "./collection/airmail";
import { airy } from "./collection/airy";
import { album } from "./collection/album";
import { amour } from "./collection/amour";
import { antique } from "./collection/antique";
import { arches } from "./collection/arches";
import { artbook } from "./collection/artbook";
import { cinema } from "./collection/cinema";
import { confetti } from "./collection/confetti";
import { contemporary } from "./collection/contemporary";
import { deco } from "./collection/deco";
import { editorial } from "./collection/editorial";
import { gallery } from "./collection/gallery";
import { herbarium } from "./collection/herbarium";
import { journal } from "./collection/journal";
import { kids } from "./collection/kids";
import { lens } from "./collection/lens";
import { luna } from "./collection/luna";
import { luxe } from "./collection/luxe";
import { magazine } from "./collection/magazine";
import { memories } from "./collection/memories";
import { mountains } from "./collection/mountains";
import { novel } from "./collection/novel";
import { oyu } from "./collection/oyu";
import { photobook } from "./collection/photobook";
import { romance } from "./collection/romance";
import { scrapbook } from "./collection/scrapbook";
import { sea } from "./collection/sea";
import { shanyrak } from "./collection/shanyrak";
import { stars } from "./collection/stars";
import { vintage } from "./collection/vintage";
import { watercolor } from "./collection/watercolor";
import { classic, minimal, modern } from "./legacy";
import type { InteriorDesign, InteriorId, StyleDirection } from "./types";

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
  novel,
  journal,
  airy,
  luxe,
  amour,
  scrapbook,
  lens,
  magazine,
  artbook,
  antique,
  contemporary,
  kids,
};

/**
 * Порядок в выборе: сначала библиотека стилей дизайнера (двенадцать направлений), затем прежние дизайны —
 * спокойная классика и дальше чередуем настроения.
 */
export const interiorDesigns: InteriorDesign[] = (
  [
    "novel", "journal", "airy", "luxe", "amour", "scrapbook", "lens", "magazine", "artbook", "antique", "contemporary", "kids",
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

/**
 * Раздел библиотеки стилей у прежних дизайнов. Не полем в самом дизайне: дизайн целиком входит в отпечаток содержимого
 * книги (кэш превью), и новое поле у прежних дизайнов пересобрало бы превью всех уже начатых книг.
 */
const LEGACY_DIRECTIONS: Partial<Record<InteriorId, StyleDirection>> = {
  classic: "literature",
  modern: "editorial",
  minimal: "minimal",
  romance: "romantic",
  stars: "art",
  oyu: "luxury",
  herbarium: "romantic",
  deco: "luxury",
  editorial: "editorial",
  airmail: "scrapbook",
  watercolor: "art",
  shanyrak: "vintage",
  mountains: "art",
  sea: "contemporary",
  vintage: "vintage",
  album: "scrapbook",
  confetti: "kids",
  photobook: "photo",
  memories: "scrapbook",
  gallery: "photo",
  arches: "photo",
  cinema: "photo",
  luna: "photo",
};

/** Раздел библиотеки стилей — для фильтра в каталоге оформлений. */
export function interiorDirection(design: InteriorDesign): StyleDirection {
  return design.direction ?? LEGACY_DIRECTIONS[design.id] ?? "literature";
}
