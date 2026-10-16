/**
 * Рабочее время отдела продаж из настроек CRM (реализация — modules/workspace, правила — shared/domain/schedule):
 * когда распределять заявки, когда отвечать «ответим утром» и как считать норматив ответа.
 */
export interface WorkSchedule {
  isWorkTime(at: Date): Promise<boolean>;
  /** Сколько рабочих минут прошло между from и to. */
  workMinutesBetween(from: Date, to: Date): Promise<number>;
}
