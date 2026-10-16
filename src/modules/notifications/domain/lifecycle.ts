import { deadlineFor, getOccasion } from "@/lib/occasions";
import { bookKind, progressOf } from "@/lib/content/kinds";
import { zonedParts } from "@/shared/domain/time";

export const DAY = 86_400_000;
/** Ручное напоминание из CRM — не чаще раза в столько дней. */
export const REMINDER_COOLDOWN_DAYS = 3;

/** Автописьма уходят только днём по времени магазина (storeTimeZone): с 10 до 20. */
export function isSendingHour(now: Date) {
  const { minutes } = zonedParts(now);
  return minutes >= 10 * 60 && minutes < 20 * 60;
}

/** Ручное напоминание можно отправить, если прошлое было достаточно давно. */
export function canRemind(remindedAt: Date | null, now: Date) {
  return !remindedAt || now.getTime() - remindedAt.getTime() >= REMINDER_COOLDOWN_DAYS * DAY;
}

/** Незаказанная книга клиента — то, что нужно правилам автописем. */
export interface DraftProgress {
  bookId: string;
  title: string;
  occasion: string | null;
  occasionDate: string | null;
  updatedAt: Date;
  /** Тема книги: по её виду — пороги прогресса (progressOf: ответы, у своей книги — слова). */
  theme: string;
  answered: number;
  /** Слов во всех ответах книги. */
  words: number;
  /** Позиция первого вопроса без ответа (для ссылки «продолжить»). */
  firstEmpty: number | null;
  hasOrder: boolean;
  /** Когда клиенту последний раз напоминали дописать книгу. */
  remindedAt: Date | null;
}

export type DraftEmail =
  | { kind: "deadline"; key: string; occasion: string; orderBy: Date; daysToTarget: number; premiumOnly: boolean }
  | { kind: "almost"; key: string }
  | { kind: "start"; key: string }
  | { kind: "nudge"; key: string };

/**
 * Какие автописьма подходят книге — по убыванию важности. Каждое уходит один раз (ключ письма),
 * поэтому вызывающий берёт первое ещё не отправленное.
 */
export function draftEmails(c: DraftProgress, now: Date): DraftEmail[] {
  const out: DraftEmail[] = [];
  const idle = now.getTime() - c.updatedAt.getTime();
  // Пороги — те же, что у хаба, готовности к заказу и воронки CRM (progressOf).
  const progress = progressOf(bookKind(c.theme), { answered: c.answered, total: 0, words: c.words });

  // Дедлайн к празднику — самое важное.
  const occasion = getOccasion(c.occasion);
  if (c.occasionDate && occasion && !c.hasOrder) {
    const dl = deadlineFor(c.occasionDate, now);
    if ((dl.state === "soon" || dl.state === "urgent" || dl.state === "premium") && dl.daysToOrder <= 5) {
      const premiumOnly = dl.state === "premium";
      out.push({ kind: "deadline", key: `deadline:${c.bookId}:${c.occasionDate}`, occasion: occasion.id, orderBy: premiumOnly ? dl.orderByPremium : dl.orderBy, daysToTarget: dl.daysToTarget, premiumOnly });
    }
  }
  // Книга почти готова — зовём посмотреть макет и оформить заказ.
  if (!c.hasOrder && progress.ready && idle > 2 * DAY) out.push({ kind: "almost", key: `almost:${c.bookId}` });
  // Не начали писать через сутки — советы, как начать.
  if (!progress.started) out.push({ kind: "start", key: `start:${c.bookId}` });
  // Начали и бросили — мягкое напоминание (не чаще раза в 3 дня).
  if (progress.started && !progress.ready && idle > 5 * DAY && (!c.remindedAt || now.getTime() - c.remindedAt.getTime() > 3 * DAY)) out.push({ kind: "nudge", key: `nudge:${c.bookId}` });
  return out;
}
