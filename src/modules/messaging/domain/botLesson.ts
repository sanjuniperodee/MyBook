/**
 * Уроки AI-продажника: форма и пределы. Отдельно от разбора (botCoach), чтобы настройки бота в браузере не тянули
 * за собой продажника и понимание сообщений (там регулярные выражения с lookbehind — Safari до 16.4 их не знает).
 */

export interface BotLesson {
  id: string;
  /** Правило для продажника: что делать иначе (до LESSON_MAX знаков). */
  text: string;
  /** Откуда урок: какая ошибка в какой беседе (для владельца). */
  why: string;
  at: string;
  source: "auto" | "owner";
}

/** Запуск разбора: когда, сколько бесед, что добавлено и убрано, вывод модели. */
export interface CoachRun {
  at: string;
  reviewed: number;
  added: string[];
  removed: string[];
  summary: string;
  error?: string;
}

export const MAX_LESSONS = 30;
export const LESSON_MAX = 220;
/** Сколько последних запусков помним (журнал в настройках). */
export const COACH_LOG = 14;
