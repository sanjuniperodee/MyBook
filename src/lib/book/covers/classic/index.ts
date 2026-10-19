/**
 * Первые, рисованные обложки: плашки и узоры на цветном фоне и «фото во всю обложку». Часть из них убрана
 * из выбора (retired в covers/index.ts), но книги с ними открываются и печатаются как раньше.
 */
import type { CoverTemplate } from "../types";
import { blossom } from "./blossom";
import { hearts } from "./hearts";
import { linen } from "./linen";
import { midnight } from "./midnight";
import { noir } from "./noir";
import { ocean } from "./ocean";
import { photo } from "./photo";
import { sage } from "./sage";
import { script } from "./script";
import { terracotta } from "./terracotta";
import { terrazzo } from "./terrazzo";

export const classicTemplates: CoverTemplate[] = [blossom, linen, midnight, sage, terracotta, hearts, script, ocean, terrazzo, noir, photo];

export { linen };
