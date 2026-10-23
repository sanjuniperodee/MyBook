import { dniVmeste } from "./together";
import { uspetKDate } from "./deadline";
import { skolkoStoitKniga } from "./price";
import { generatorPozdravlenij } from "./greeting";
import { voprosyDlyaRazgovora } from "./cards";
import { testMama, testPapa, testBabushka, testLyubimyj } from "./quizzes";
import type { ToolDef } from "./types";

export type * from "./types";

/**
 * Бесплатные инструменты /instrumenty/<slug>: интерактивные страницы, на которые приходят из поиска по запросам вроде
 * «сколько мы вместе», «поздравление маме» или «когда заказать подарок». Каждый ведёт к книге на подходящую тему.
 * Расчёты выполняются в браузере и ничего не сохраняют; адрес общий для двух языков (/kk/instrumenty/<slug>).
 */
export const tools: ToolDef[] = [dniVmeste, uspetKDate, generatorPozdravlenij, voprosyDlyaRazgovora, testMama, testPapa, testBabushka, testLyubimyj, skolkoStoitKniga];

export function getTool(slug: string) {
  return tools.find((t) => t.slug === slug);
}
