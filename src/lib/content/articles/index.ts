import { voprosyMame } from "./voprosy-mame";
import { voprosyPape } from "./voprosy-pape";
import { voprosyLyubimomu } from "./voprosy-lyubimomu";
import { voprosyDrugu } from "./voprosy-drugu";
import { kakNapisatKniguVPodarok } from "./kak-napisat-knigu-v-podarok";
import { chtoPodaritMame } from "./chto-podarit-mame";
import { nazvaniyaGodovshchinSvadby } from "./nazvaniya-godovshchin-svadby";
import { chtoPodaritPape } from "./chto-podarit-pape";
import { chtoPodaritNaGodovshchinuOtnoshenij } from "./chto-podarit-na-godovshchinu-otnoshenij";
import { pozdravlenieMameSDnemRozhdeniya } from "./pozdravlenie-mame-s-dnem-rozhdeniya";
import { chtoPodaritUchitelyu } from "./chto-podarit-uchitelyu";
import { kakZapisatVospominaniyaBabushki } from "./kak-zapisat-vospominaniya-babushki";
import type { Article } from "./types";

export type * from "./types";

/**
 * Статьи блога (/blog/<slug>): ответы на информационные запросы вокруг подарочной книги —
 * «вопросы маме», «как написать книгу в подарок», «что подарить маме».
 * В статьях-подборках вопросов список берётся из настоящего банка вопросов темы (themes.ts),
 * поэтому он всегда совпадает с тем, что человек увидит в редакторе книги.
 * Тексты на каждом языке написаны отдельно, а не переведены дословно.
 */
export const articles: Article[] = [voprosyMame, voprosyPape, voprosyLyubimomu, voprosyDrugu, kakNapisatKniguVPodarok, chtoPodaritMame, nazvaniyaGodovshchinSvadby, chtoPodaritPape, chtoPodaritNaGodovshchinuOtnoshenij, pozdravlenieMameSDnemRozhdeniya, chtoPodaritUchitelyu, kakZapisatVospominaniyaBabushki];

export function getArticle(slug: string) {
  return articles.find((a) => a.slug === slug);
}
