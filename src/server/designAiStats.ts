import "server-only";
import { DEFAULT_PRICES } from "@/modules/assistant";
import type { DesignAiStats } from "@/modules/reporting";
import { container } from "@/server/container";

export type { DesignAiStats };

/**
 * Статистика ИИ-дизайнера для админки. Запросы — в модуле reporting (сторона чтения); здесь — прайс Haiku для оценки
 * стоимости старых записей (до 24.10.2026 другой модели не было).
 */
export function designAiStats(days: number, freeLimit: number): Promise<DesignAiStats> {
  return container().reporting.designAi(days, freeLimit, DEFAULT_PRICES["claude-haiku-5-5"]);
}
