import { dniVmeste } from "./together";
import { uspetKDate } from "./deadline";
import { skolkoStoitKniga } from "./price";
import { generatorPozdravlenij } from "./greeting";
import { voprosyDlyaRazgovora } from "./cards";
import { testMama, testPapa, testBabushka, testLyubimyj } from "./quizzes";
import { proverkaFoto, skolkoStranits, planKnigi, shezhire } from "./useful";
import type { ToolDef } from "./types";

export type * from "./types";

/**
 * Бесплатные инструменты /instrumenty/<slug>: интерактивные страницы, на которые приходят из поиска по запросам вроде
 * «шежіре онлайн», «сколько страниц в книге», «dpi для печати фото» или «когда заказать подарок». Сначала — полезные автору
 * книги (проверка фото, план, объём, родословная), затем остальные. Каждый ведёт к книге на подходящую тему.
 * Расчёты выполняются в браузере и ничего не сохраняют; адрес общий для двух языков (/kk/instrumenty/<slug>).
 */
export const tools: ToolDef[] = [proverkaFoto, planKnigi, skolkoStranits, shezhire, uspetKDate, skolkoStoitKniga, dniVmeste, generatorPozdravlenij, voprosyDlyaRazgovora, testMama, testPapa, testBabushka, testLyubimyj];

export function getTool(slug: string) {
  return tools.find((t) => t.slug === slug);
}
