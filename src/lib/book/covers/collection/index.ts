/**
 * Вторая коллекция обложек. Все рисуются в SVG в миллиметрах развёртки: одна функция
 * даёт и превью на сайте, и файл для типографии. Правила скорости — в covers/svg-kit.ts.
 */
import { constellation } from "./constellation";
import { deco } from "./deco";
import { herbarium } from "./herbarium";
import { leather } from "./leather";
import { lemons } from "./lemons";
import { letter } from "./letter";
import { mountains } from "./mountains";
import { oyu } from "./oyu";
import { sunrise } from "./sunrise";
import { tulips } from "./tulips";
import type { CoverTemplate } from "../types";

export const collectionTemplates: CoverTemplate[] = [oyu, constellation, sunrise, herbarium, tulips, deco, leather, letter, lemons, mountains];
