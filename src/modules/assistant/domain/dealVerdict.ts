/**
 * Вывод по затихшей заявке из переписки: клиент отказался (и почему), обещал вернуться, просто замолчал или это не
 * покупатель. По выводу «Порядок в воронке» ставит этап и причину отказа, а в ленту сделки — короткую заметку.
 */
export const DEAL_VERDICTS = ["refused", "later", "silent", "active", "spam"] as const;
export type DealVerdictKind = (typeof DEAL_VERDICTS)[number];

export interface DealVerdict {
  verdict: DealVerdictKind;
  /** Причина отказа — одна из причин воронки (только для refused). */
  reason: string | null;
  /** Когда клиент обещал вернуться («после зарплаты», «в декабре») — как сказал, коротко. */
  later: string | null;
  /** Одна строка для ленты сделки: кому книга, что назвали по цене, чем кончилось. */
  note: string;
}

export function dealVerdictPrompt(reasons: string[], today: string): string {
  return [
    "Ты разбираешь переписку магазина персональных книг-подарков с клиентом, который пока не оплатил. Сегодня " + today + ".",
    "Определи состояние заявки по переписке и заметкам менеджера. Отвечай только JSON по схеме.",
    "verdict:",
    "- refused — клиент ясно отказался: не нужно, неактуально, передумал, дома сказали не надо, купил или подарил другое, дорого и уходит, не успеваем к дате.",
    "- later — клиент сказал, что подумает, посоветуется или вернётся позже, либо назвал срок; не отказался.",
    "- active — разговор идёт: клиент недавно пишет по делу или ждёт нашего ответа.",
    "- silent — клиент перестал отвечать, ничего не решив.",
    "- spam — это не покупатель: поставщик, реклама, поиск работы, ошиблись номером, служебный или пустой чат.",
    "«Подумаю», «посоветуюсь», «напишу позже» — это later, а не refused. Сомневаешься между refused и later — later.",
    `reason — только для refused, строго одно из: ${reasons.map((r) => `«${r}»`).join(", ")}. Иначе пустая строка.`,
    "later — для later: когда клиент обещал вернуться, его словами и коротко («после 15 ноября», «в декабре»). Иначе пустая строка.",
    "note — одна короткая строка по-русски, только факты из переписки: кому книга, повод, дата и город, если есть; какую цену назвали; чем закончилось. Без оценок и советов, до 200 знаков.",
  ].join("\n");
}

export const dealVerdictSchema = (reasons: string[]) => ({
  type: "object",
  properties: {
    verdict: { type: "string", enum: [...DEAL_VERDICTS] },
    reason: { type: "string", enum: [...reasons, ""] },
    later: { type: "string" },
    note: { type: "string" },
  },
  required: ["verdict", "reason", "later", "note"],
  additionalProperties: false,
});

/** Ответ модели → вывод: неизвестный вердикт — null; причина вне списка отбрасывается (отказ без причины — «Передумал», если она есть в списке). */
export function normalizeDealVerdict(raw: unknown, reasons: string[]): DealVerdict | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const verdict = DEAL_VERDICTS.find((v) => v === r.verdict);
  if (!verdict) return null;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const named = reasons.find((x) => x === text(r.reason, 80)) ?? null;
  return {
    verdict,
    reason: verdict === "refused" ? (named ?? reasons.find((x) => x === "Передумал") ?? reasons[0] ?? null) : null,
    later: verdict === "later" ? text(r.later, 60) || null : null,
    note: text(r.note, 240),
  };
}
