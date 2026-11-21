import type { ClientAiTool } from "@/server/clientAiLimits";

/** Подписи помощников и окон лимитов — общие для страницы, действий и форм. */

/** «10 мин», «1 ч», «1 ч 30 мин». */
export function minutesLabel(m: number) {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h} ч${r ? ` ${r} мин` : ""}` : `${m} мин`;
}

/** «сутки», «2 сут.», «12 ч». */
export function hoursLabel(h: number) {
  return h === 24 ? "сутки" : h % 24 === 0 ? `${h / 24} сут.` : `${h} ч`;
}

export const CLIENT_AI_TOOL_LABELS: Record<
  ClientAiTool,
  { title: string; note: string }
> = {
  writer: {
    title: "Помощник при письме",
    note: "«Оформить», «Улучшить», «Короче», «Длиннее», «Переписать по просьбе»",
  },
  proofread: {
    title: "AI-корректор",
    note: "«Проверить грамотность» в редакторе",
  },
  help: {
    title: "Помощник в кабинете",
    note: "Вопросы клиента в кабинете книги",
  },
};
