import { workMinutesBetween, type WorkHours } from "@/shared/domain/schedule";
import { storeTimeZone } from "@/shared/domain/time";

/**
 * Вопрос клиента и первый ответ на него (analytics-2): asked — входящее, открывшее ожидание; human — первый ответ
 * человека (из CRM или с телефона магазина), author — кто ответил (null — с телефона, держатель неизвестен); bot — первый
 * ответ бота или правила. Заметки — не ответ.
 */
export interface ResponsePair {
  conversationId: string;
  asked: Date;
  human: Date | null;
  author: string | null;
  bot: Date | null;
}

export interface ResponseGroup {
  /** Вопросов, на которые этот автор ответил первым из людей. */
  answered: number;
  /** Медиана ожидания ответа человека, рабочих минут. */
  median: number | null;
  /** Доля ответов в норматив (рабочих минут), 0…1. */
  inSla: number | null;
}

export interface ResponseStats {
  /** Все люди вместе (итог, а не группа «без автора»). */
  total: ResponseGroup & { asked: number; unanswered: number };
  byAuthor: Map<string | null, ResponseGroup>;
  /** Бот и правила: сколько раз ответили раньше человека и за сколько (календарных минут). */
  bot: { first: number; median: number | null };
  /** Дольше всех ждали ответа человека (рабочих минут), без ответа — по сей момент. */
  longest: { conversationId: string; asked: Date; minutes: number; answered: boolean }[];
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const group = (waits: number[], sla: number): ResponseGroup => ({ answered: waits.length, median: median(waits), inSla: waits.length ? waits.filter((w) => w <= sla).length / waits.length : null });

/**
 * Честная скорость ответа (chats-1, analytics-2, chats-d1, analytics-d1, analytics-d2): ожидание — в рабочих минутах по
 * графику (ночь не «сжигает» норматив), ответ — только человека; бот и правила — отдельной цифрой, заметки — не ответ.
 * Итог — по всем людям, а не по группе «без автора».
 */
export function responseStats(pairs: readonly ResponsePair[], hours: WorkHours, sla: number, now: Date, tz = storeTimeZone()): ResponseStats {
  const waits: number[] = [];
  const by = new Map<string | null, number[]>();
  const botWaits: number[] = [];
  const longest: ResponseStats["longest"] = [];
  let unanswered = 0;
  for (const p of pairs) {
    const minutes = workMinutesBetween(p.asked, p.human ?? now, hours, tz);
    longest.push({ conversationId: p.conversationId, asked: p.asked, minutes, answered: !!p.human });
    if (p.bot && (!p.human || p.bot < p.human)) botWaits.push(Math.round((p.bot.getTime() - p.asked.getTime()) / 60_000));
    if (!p.human) {
      unanswered++;
      continue;
    }
    waits.push(minutes);
    by.set(p.author, [...(by.get(p.author) ?? []), minutes]);
  }
  longest.sort((a, b) => b.minutes - a.minutes);
  return {
    total: { ...group(waits, sla), asked: pairs.length, unanswered },
    byAuthor: new Map([...by].map(([k, v]) => [k, group(v, sla)])),
    bot: { first: botWaits.length, median: median(botWaits) },
    longest: longest.slice(0, 10),
  };
}
