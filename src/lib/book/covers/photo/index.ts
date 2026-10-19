/**
 * Коллекция обложек на настоящих снимках (Unsplash, бесплатная лицензия Unsplash License:
 * коммерческое использование разрешено, указание автора не обязательно). Файлы — assets/cover-photos/<id>.jpg,
 * авторы — в поле credit. Раскладка и отрисовка — src/lib/book/photo-cover.ts.
 */
import { alatau } from "./alatau";
import { autumn } from "./autumn";
import { bouquet } from "./bouquet";
import { clouds } from "./clouds";
import { dried } from "./dried";
import { dusk } from "./dusk";
import { eucalyptus } from "./eucalyptus";
import { flax } from "./flax";
import { lavender } from "./lavender";
import { lights } from "./lights";
import { marble } from "./marble";
import { meadow } from "./meadow";
import { milkyway } from "./milkyway";
import { mint } from "./mint";
import { mist } from "./mist";
import { party } from "./party";
import { peaks } from "./peaks";
import { peony } from "./peony";
import { postcards } from "./postcards";
import { roses } from "./roses";
import { saddle } from "./saddle";
import { sakura } from "./sakura";
import { steppe } from "./steppe";
import { surf } from "./surf";
import { tenderness } from "./tenderness";
import { velvet } from "./velvet";
import type { CoverTemplate } from "../types";

export const photoCollection: CoverTemplate[] = [
  // ─── романтика ───
  peony,
  roses,
  velvet,
  lights,
  dusk,
  bouquet,
  // ─── нежные ───
  tenderness,
  clouds,
  dried,
  eucalyptus,
  lavender,
  meadow,
  mint,
  // ─── классика ───
  flax,
  saddle,
  marble,
  alatau,
  mist,
  postcards,
  milkyway,
  peaks,
  // ─── яркие ───
  sakura,
  surf,
  party,
  autumn,
  steppe,
];
