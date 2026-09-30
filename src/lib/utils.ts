import { clsx, type ClassValue } from "clsx";
import { messagesFor } from "@/i18n/messages";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * «14 февраля 2027 г.» / «2027 жылғы 14 ақпан». Казахский собираем из словаря, а не через Intl("kk-KZ"):
 * в части браузеров (и в headless Chromium) нет данных ICU для kk, и сервер с клиентом разошлись бы.
 */
export function formatDate(d: Date | string, withTime = false, locale: "ru" | "kk" = "ru") {
  const date = typeof d === "string" ? new Date(d) : d;
  const timeZone = process.env.TZ || "Asia/Almaty";
  if (locale === "ru")
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}), timeZone }).format(date);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const day = messagesFor("kk").common.date(new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day)), true);
  return withTime ? `${day}, ${parts.hour}:${parts.minute}` : day;
}

/** Текущее время для серверных страниц (рендер на каждый запрос). */
export function nowMs() {
  return Date.now();
}
