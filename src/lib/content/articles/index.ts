import { voprosyMame } from "./voprosy-mame";
import { voprosyPape } from "./voprosy-pape";
import { voprosyLyubimomu } from "./voprosy-lyubimomu";
import { voprosyDrugu } from "./voprosy-drugu";
import { kakNapisatKniguVPodarok } from "./kak-napisat-knigu-v-podarok";
import { chtoPodaritMame } from "./chto-podarit-mame";
import type { Article } from "./types";

export type * from "./types";

/**
 * Статьи блога (/blog/<slug>): ответы на информационные запросы вокруг подарочной книги —
 * «вопросы маме», «как написать книгу в подарок», «что подарить маме».
 * В статьях-подборках вопросов список берётся из настоящего банка вопросов темы (themes.ts),
 * поэтому он всегда совпадает с тем, что человек увидит в редакторе книги.
 * Тексты на каждом языке написаны отдельно, а не переведены дословно.
 */
export const articles: Article[] = [voprosyMame, voprosyPape, voprosyLyubimomu, voprosyDrugu, kakNapisatKniguVPodarok, chtoPodaritMame];

export function getArticle(slug: string) {
  return articles.find((a) => a.slug === slug);
}
