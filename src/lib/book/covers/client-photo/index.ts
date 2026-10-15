/**
 * Обложки с фотографиями клиента: окна и рамки (арка, медальон, паспарту, галерея, круг), карточки
 * (полароид, стопка, марка, ретро), снимок во всю обложку (глянец, монохром, сияние, дуотон, индиго),
 * журнальные раскладки (журнал, дымка, обрывок, ленты, минимализм) и коллажи на несколько снимков.
 *
 * Пока фото не выбрано, место заполняет снимок-пример с людьми (samples, sample-photos.ts) —
 * там, где вызывающий умеет его загрузить; иначе рисованный пейзаж (svg-kit). В печать примеры не попадают:
 * без своих фото заказ не оформить. Обложки на готовых снимках (фото — часть дизайна) — в covers/photo.
 * Оборот у них свой — спокойный фон в цвет лица: композицию с фото на задней крышке не повторяем.
 * Правила скорости растрирования — в covers/svg-kit.ts.
 */
import { arch } from "./arch";
import { circle } from "./circle";
import { collage } from "./collage";
import { diptych } from "./diptych";
import { duotone } from "./duotone";
import { fade } from "./fade";
import { film } from "./film";
import { gallery } from "./gallery";
import { glowCover } from "./glow";
import { grid } from "./grid";
import { heart } from "./heart";
import { indigo } from "./indigo";
import { magazine } from "./magazine";
import { medallion } from "./medallion";
import { minimal } from "./minimal";
import { mono } from "./mono";
import { mosaic } from "./mosaic";
import { passepartout } from "./passepartout";
import { polaroid } from "./polaroid";
import { vintage } from "./retro";
import { split } from "./split";
import { stack } from "./stack";
import { stamp } from "./stamp";
import { strips } from "./strips";
import { torn } from "./torn";
import type { CoverTemplate } from "../types";

export const clientPhotoTemplates: CoverTemplate[] = [
  arch,
  polaroid,
  medallion,
  passepartout,
  heart,
  magazine,
  duotone,
  indigo,
  collage,
  mosaic,
  film,
  mono,
  glowCover,
  split,
  fade,
  torn,
  gallery,
  stamp,
  vintage,
  circle,
  strips,
  minimal,
  diptych,
  stack,
  grid,
];

/** Порядок в выборе: чередуем окна, карточки, «во всю» и коллажи. */
export const clientPhotoOrder = [
  "fade", "arch", "polaroid", "gallery", "magazine", "heart", "stack", "mono", "medallion", "split", "stamp", "circle",
  "collage", "glow", "torn", "passepartout", "retro", "diptych", "strips", "duotone", "mosaic", "minimal", "film", "grid", "indigo",
];
