/**
 * Рабочее время отдела продаж из настроек CRM (реализация — modules/workspace, правила — shared/domain/schedule):
 * когда распределять заявки, когда отвечать «ответим утром» и как считать норматив ответа.
 */
export interface WorkSchedule {
  isWorkTime(at: Date): Promise<boolean>;
  /** Когда начнётся рабочее время: at рабочее — сам at, иначе начало ближайшей смены; null — в графике нет рабочих дней. */
  nextWorkStart(at: Date): Promise<Date | null>;
  /** Сколько рабочих минут прошло между from и to. */
  workMinutesBetween(from: Date, to: Date): Promise<number>;
  /** Срок через minutes рабочих минут от from (ночь и выходные не считаются; вне смены — от её начала). */
  addWorkMinutes(from: Date, minutes: number): Promise<Date>;
}
