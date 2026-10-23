/**
 * Файл календаря (.ics, RFC 5545) с событиями на весь день и напоминанием в 9 утра. Чистые функции: страница собирает
 * строку и отдаёт её как скачиваемый файл. Адрес события — по uid, поэтому повторная загрузка заменяет события, а не дублирует.
 */
export interface IcsEvent {
  uid: string;
  /** День события по местному времени. */
  date: Date;
  summary: string;
  description?: string;
  /** Правило повторения, например «FREQ=YEARLY» (для дней рождения). */
  rrule?: string;
  /** Напоминания: триггер по RFC 5545 («-P14D» — за 14 дней, «PT9H» — в 9 утра в день события) и их текст. Нет — одно в 9 утра. */
  alarms?: { trigger: string; text?: string }[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const day = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const stamp = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

/** Значение текстового поля: обратный слэш, точка с запятой, запятая и переносы строк экранируются. */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Строки длиннее 75 байт переносятся (продолжение начинается с пробела); многобайтный символ не разрезается. */
export function icsFold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      parts.push(cur);
      cur = "";
      bytes = 0;
      limit = 74;
    }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

export function buildIcs(events: readonly IcsEvent[], opts: { calendarName: string; now?: Date }): string {
  const now = opts.now ?? new Date();
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MyBooks//Planner//RU", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsEscape(opts.calendarName)}`];
  for (const e of events) {
    const next = new Date(e.date.getFullYear(), e.date.getMonth(), e.date.getDate() + 1);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${day(e.date)}`,
      `DTEND;VALUE=DATE:${day(next)}`,
      ...(e.rrule ? [`RRULE:${e.rrule}`] : []),
      `SUMMARY:${icsEscape(e.summary)}`,
      ...(e.description ? [`DESCRIPTION:${icsEscape(e.description)}`] : []),
    );
    for (const a of e.alarms ?? [{ trigger: "PT9H" }]) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(a.text ?? e.summary)}`, `TRIGGER;RELATED=START:${a.trigger}`, "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}
