/**
 * Личный календарь сотрудника в формате iCalendar (RFC 5545) — подписка по ссылке в Google, Apple, Outlook.
 * Приватность: в событии только название карточки и ссылка на неё в CRM — без телефонов, сумм и переписки клиента.
 */

export interface IcalEvent {
  uid: string;
  title: string;
  url: string;
  /** Начало (у задачи со сроком без начала — срок минус длительность). */
  start: Date;
  end: Date;
  /** Срок без времени (весь день): срок задачи «к 18:00» без явного времени показываем днём. */
  allDay?: boolean;
  done?: boolean;
  updatedAt: Date;
}

const pad = (n: number) => String(n).padStart(2, "0");
const utc = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const day = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

/** Экранирование текста iCal: \\, ;, , и переводы строк. */
export const icalText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Строки длиннее 75 октетов переносятся (продолжение начинается с пробела). */
export function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let len = 0;
  for (const ch of line) {
    const l = new TextEncoder().encode(ch).length;
    if (len + l > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      len = 0;
    }
    cur += ch;
    len += l;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcal(name: string, events: IcalEvent[], now = new Date()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MyBooks//CRM//RU", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icalText(name)}`, "X-WR-TIMEZONE:Asia/Almaty", "REFRESH-INTERVAL;VALUE=DURATION:PT15M", "X-PUBLISHED-TTL:PT15M"];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${utc(now)}`, `LAST-MODIFIED:${utc(e.updatedAt)}`);
    if (e.allDay) {
      const next = new Date(e.start);
      next.setDate(next.getDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${day(e.start)}`, `DTEND;VALUE=DATE:${day(next)}`);
    } else lines.push(`DTSTART:${utc(e.start)}`, `DTEND:${utc(e.end)}`);
    lines.push(`SUMMARY:${icalText(e.done ? `✓ ${e.title}` : e.title)}`, `URL:${e.url}`, `DESCRIPTION:${icalText(e.url)}`);
    if (e.done) lines.push("STATUS:CONFIRMED", "TRANSP:TRANSPARENT");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** Длительность события задачи в календаре: встреча — час, звонок и прочее — 30 минут. */
export const eventMinutes = (kind: string) => (kind === "meeting" ? 60 : 30);
