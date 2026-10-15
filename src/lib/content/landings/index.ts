import { podarokLyubimomu } from "./podarok-lyubimomu";
import { knigaMame } from "./kniga-mame";
import { knigaPape } from "./kniga-pape";
import { knigaDrugu } from "./kniga-drugu";
import { podarokNaGodovshchinu } from "./podarok-na-godovshchinu";
import { podarokNa14Fevralya } from "./podarok-na-14-fevralya";
import { podarokNa8Marta } from "./podarok-na-8-marta";
import { podarokMuzhu } from "./podarok-muzhu";
import { podarokZhene } from "./podarok-zhene";
import { podarokParnyu } from "./podarok-parnyu";
import { podarokDevushke } from "./podarok-devushke";
import { podarokNaYubilejMame } from "./podarok-na-yubilej-mame";
import { podarokNaYubilejPape } from "./podarok-na-yubilej-pape";
import { podarokPapeNa23Fevralya } from "./podarok-pape-na-23-fevralya";
import type { Landing } from "./types";

export type * from "./types";

/**
 * Посадочные страницы под поисковые запросы и рекламу: «книга в подарок маме»,
 * «подарок на годовщину» и т.п. Тексты уникальные для каждого языка (не дословный перевод —
 * казахская версия написана под казахские запросы), вопросы — из настоящего банка вопросов темы.
 * Адрес общий: /kniga/<slug> и /kk/kniga/<slug>, связаны через hreflang.
 */
export const landings: Landing[] = [podarokLyubimomu, knigaMame, knigaPape, knigaDrugu, podarokNaGodovshchinu, podarokNa14Fevralya, podarokNa8Marta, podarokMuzhu, podarokZhene, podarokParnyu, podarokDevushke, podarokNaYubilejMame, podarokNaYubilejPape, podarokPapeNa23Fevralya];

export function getLanding(slug: string) {
  return landings.find((l) => l.slug === slug);
}
