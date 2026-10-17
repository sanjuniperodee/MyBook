import { storeTimeZone, zonedParts } from "@/shared/domain/time";
import { matchOption, parseDateAnswer } from "@/modules/messaging/domain/botParse";
import type { BotLang } from "@/modules/messaging/domain/botNlu";

export type { BotConfig } from "@/modules/messaging/domain/botConfig";

/**
 * Режим бота: выключен; всегда; только вне рабочего времени; «если менеджер не ответил» — в рабочее время бот ждёт
 * ответа человека N минут (настройка waitMinutes), вне рабочего времени отвечает сразу.
 */
export type BotMode = "off" | "always" | "off_hours" | "fallback";
export const BOT_MODES: readonly BotMode[] = ["off", "fallback", "off_hours", "always"];
export const isBotMode = (v: string): v is BotMode => (BOT_MODES as readonly string[]).includes(v);
/** Режим, пока владелец его не выбрал: «всегда сразу» (решение владельца 17.10); остальные — выбор в админке. */
export const DEFAULT_BOT_MODE: BotMode = "always";
/** bot_step: null — бот не работал, N — задаёт вопрос N, -1 — закончил, передал человеку или его остановили. */
export const BOT_DONE = -1;

export interface DealField {
  key: string;
  label: string;
  type: string;
  options: string[];
}

/** Ответ клиента → значение своего поля сделки (вариант из списка, дата, число или текст). */
export function answerValue(text: string, field: DealField | undefined, now = new Date()): string | number | null {
  const t = text.trim().slice(0, 300);
  if (field?.type === "select") return matchOption(t, field.options);
  if (field?.type === "date") return parseDateAnswer(t, now);
  if (field?.type === "number") {
    const m = /-?\d+(?:[.,]\d+)?/.exec(t.replace(/(?<=\d)\s(?=\d{3}\b)/g, ""));
    const n = m ? Number(m[0].replace(",", ".")) : NaN;
    return Number.isFinite(n) ? n : null;
  }
  return t || null;
}

/**
 * Имя для обращения: первое слово с буквами (эмодзи и значки срезаются), имя клиента из CRM важнее имени профиля
 * WhatsApp. «🤍» → «» (тогда просто «Здравствуйте!»).
 */
export function safeName(profileName: string, clientName?: string | null): string {
  const pick = (s: string | null | undefined) => {
    for (const raw of (s ?? "").split(/\s+/)) {
      const w = raw.replace(/[^\p{L}'-]/gu, "").replace(/^[-']+|[-']+$/g, "");
      if (/\p{L}{2,}/u.test(w) && w.length <= 30) return w.charAt(0).toLocaleUpperCase("ru") + w.slice(1);
    }
    return "";
  };
  return pick(clientName) || pick(profileName);
}

const RU_WEEKDAY_ACC = ["в понедельник", "во вторник", "в среду", "в четверг", "в пятницу", "в субботу", "в воскресенье"];
const KK_WEEKDAY = ["дүйсенбі", "сейсенбі", "сәрсенбі", "бейсенбі", "жұма", "сенбі", "жексенбі"];
/** Казахский исходный падеж после времени: 09:00-ден, 09:30-дан, 09:15-тен (по последнему произносимому слову). */
const KK_FROM_UNITS = ["ден", "ден", "ден", "тен", "тен", "тен", "дан", "ден", "ден", "дан"];
const KK_FROM_TENS: Record<number, string> = { 1: "нан", 2: "дан", 3: "дан", 4: "тан", 5: "ден" };
const kkFrom = (minutes: number) => (minutes === 0 ? "ден" : minutes % 10 ? KK_FROM_UNITS[minutes % 10] : KK_FROM_TENS[minutes / 10]);

/** Когда ответит менеджер: «завтра с 09:00», «в понедельник с 09:00» / «ертең сағат 09:00-ден бастап». */
export function whenText(start: Date, now: Date, lang: BotLang, tz = storeTimeZone()): string {
  const s = zonedParts(start, tz);
  const n = zonedParts(now, tz);
  const days = Math.round((Date.UTC(s.y, s.m - 1, s.d) - Date.UTC(n.y, n.m - 1, n.d)) / 86_400_000);
  const hh = String(Math.floor(s.minutes / 60)).padStart(2, "0");
  const mm = String(s.minutes % 60).padStart(2, "0");
  const time = `${hh}:${mm}`;
  if (lang === "kk") {
    const day = days <= 0 ? "бүгін" : days === 1 ? "ертең" : `${KK_WEEKDAY[s.weekday - 1]} күні`;
    return `${day} сағат ${time}-${kkFrom(s.minutes % 60)} бастап`;
  }
  const day = days <= 0 ? "сегодня" : days === 1 ? "завтра" : RU_WEEKDAY_ACC[s.weekday - 1];
  return `${day} с ${time}`;
}

const RU_MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const KK_MONTHS = ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"];
const RU_WEEKDAY_SHORT = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

/** Дата YYYY-MM-DD для клиента: «21 ноября» / «21 қараша»; для менеджера (full) — «21 ноября 2026, сб». */
export function humanDate(isoDate: string, lang: BotLang, full = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return isoDate;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (lang === "kk") return `${d} ${KK_MONTHS[mo - 1]}${full ? ` ${y}` : ""}`;
  if (!full) return `${d} ${RU_MONTHS_GEN[mo - 1]}`;
  const weekday = (new Date(Date.UTC(y, mo - 1, d)).getUTCDay() + 6) % 7;
  return `${d} ${RU_MONTHS_GEN[mo - 1]} ${y}, ${RU_WEEKDAY_SHORT[weekday]}`;
}
