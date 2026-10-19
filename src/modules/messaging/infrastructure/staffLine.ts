import { normalizePhone } from "@/shared/domain/phone";
import type { StaffLine } from "../application";

/** Сколько помнить отправленное сотруднику: эхо приходит за секунды, сверка со шлюзом догоняет его в пределах часов. */
const SENT_TTL_MS = 24 * 3_600_000;
/** Не больше стольких отметок в памяти (напоминаний в сутки — десятки). */
const SENT_MAX = 2000;
/** Список номеров сотрудников перечитывается не чаще раза в минуту (проверка — на каждое входящее WhatsApp). */
const PHONES_TTL_MS = 60_000;

/**
 * Служебная линия процесса: номера действующих сотрудников (из Access, кэш на минуту) и что CRM сама отправила
 * сотрудникам с номера магазина — id в канале и текст, на сутки. Текст запоминается до отправки: эхо шлюза может
 * прийти раньше, чем он вернёт id сообщения.
 */
export function staffLine(activePhones: () => Promise<string[]>, now: () => number = Date.now): StaffLine & { remember(sent: { externalId?: string | null; text: string }): void } {
  const sent = new Map<string, number>();
  let phones: { at: number; set: Set<string> } | null = null;
  const prune = () => {
    const t = now();
    for (const [key, expires] of sent) {
      if (expires > t && sent.size <= SENT_MAX) break;
      sent.delete(key);
    }
  };
  const mark = (key: string) => {
    sent.delete(key);
    sent.set(key, now() + SENT_TTL_MS);
  };
  return {
    remember({ externalId, text }) {
      if (externalId) mark(`id:${externalId}`);
      if (text.trim()) mark(`text:${text.trim()}`);
      prune();
    },
    isServiceEcho(m) {
      prune();
      return sent.has(`id:${m.externalId}`) || (!!m.text.trim() && sent.has(`text:${m.text.trim()}`));
    },
    async isStaffPhone(phone) {
      if (!phones || now() - phones.at > PHONES_TTL_MS) {
        const list = await activePhones();
        phones = { at: now(), set: new Set(list.map(normalizePhone).filter((p) => p.length >= 10)) };
      }
      const digits = normalizePhone(phone);
      return digits.length >= 10 && phones.set.has(digits);
    },
  };
}
