/**
 * Чистые хелперы для чатов CRM: «Почему так?» AI-продажника и коммерческие предложения (КП) в чате.
 * Используются и в apps/api, и в NestJS (apps/backend) без копипасты.
 */
import type { BotTurnTrace } from "../domain/botTrace";
import { traceRows } from "./botTrace";

export interface BotTraceRowDto {
  label: string;
  lines: string[];
  warn: boolean;
}

export interface BotTraceListItem {
  id: string;
  at: Date;
  messageId: string | null;
  trace: BotTurnTrace;
}

/** Строки следа хода AI-продажника в формате контракта API v1. */
export function botTraceRows(trace: BotTurnTrace): BotTraceRowDto[] {
  return traceRows(trace).map((x) => ({ label: x.label, lines: x.lines, warn: !!x.warn }));
}

/** Журнал последних ходов бота в диалоге (ответы и молчание) для экрана «Почему так?». */
export function botTraceItems(list: BotTraceListItem[]) {
  return list.map((item) => {
    const rows = botTraceRows(item.trace);
    const head = rows.find((r) => r.label === "Модель решила") ?? rows.find((r) => r.label === "Итог хода") ?? rows[0];
    return {
      id: item.id,
      at: item.at.toISOString(),
      messageId: item.messageId,
      silent: item.messageId === null,
      summary: head?.lines[0] ?? "Ход бота",
      rows,
    };
  });
}

const HOUR_LABELS: Record<number, string> = {
  24: "на сутки",
  48: "на 2 дня",
  72: "на 3 дня",
  168: "на неделю",
};

/** Подпись срока действия персональной скидки (как в ChatPanel веб-CRM). */
export function offerHourLabel(h: number): string {
  return HOUR_LABELS[h] ?? (h % 24 === 0 ? `на ${h / 24} дн.` : `на ${h} ч`);
}

/** Варианты процента скидки как в ChatPanel (шаг 5% до max; если предел не кратен 5 — добавляем его). */
export function discountPercents(max: number): number[] {
  if (max <= 0) return [];
  const list = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50].filter((p) => p <= max);
  if (!list.includes(max)) list.push(max);
  return list;
}

/** Подписи всех доступных сроков действия персональной скидки. */
export function offerHourOptions(hours: readonly number[]): Array<{ hours: number; label: string }> {
  return hours.map((h) => ({ hours: h, label: offerHourLabel(h) }));
}
