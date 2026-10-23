import "server-only";
import { container } from "@/server/container";
import { getSetting } from "@/modules/workspace";
import { DIGEST_DEADLINE_DAYS, type MorningDigest } from "@/modules/reporting";
import { zonedDay, zonedParts } from "@/shared/domain/time";

/** Сводка уходит с 09:00 и не позже полудня: проспали утро (перезапуск сервера) — в этот день её уже нет. */
const DIGEST_FROM_MIN = 9 * 60;
const DIGEST_UNTIL_MIN = 12 * 60;

/** Текст сводки; null — сообщать нечего (тогда и уведомления нет). */
export function digestText(d: MorningDigest): { title: string; body: string } | null {
  const lines = [
    d.waiting ? `ждут ответа дольше норматива: ${d.waiting}` : null,
    d.claims ? `клиент сообщил об оплате — проверить: ${d.claims}` : null,
    d.deadlines ? `дата события в ближайшие ${DIGEST_DEADLINE_DAYS} дня: ${d.deadlines}` : null,
    d.botChats ? `бот за ночь вёл бесед: ${d.botChats}${d.botHandoffs ? `, передал вам: ${d.botHandoffs}` : ""}` : null,
  ].filter((l): l is string => !!l);
  if (!lines.length) return null;
  return { title: "Утренняя сводка", body: lines.map((l) => `• ${l}`).join("\n") };
}

export interface DigestDeps {
  now(): Date;
  enabled(): Promise<boolean>;
  isWorkTime(at: Date): Promise<boolean>;
  sentDay(): Promise<string>;
  markSent(day: string): Promise<void>;
  digest(): Promise<MorningDigest>;
  notify(n: { title: string; body: string }): Promise<void>;
}

/**
 * Утренняя сводка (bots-11, analytics-4, tasks-20): в начале смены — с 09:00 по поясу магазина, в рабочий день — одна в
 * сутки всем, кто ведёт сделки, в колокольчик и push: чаты без ответа дольше норматива, «я оплатил», даты на 3 дня, ночь
 * бота. День отмечается до отправки: перезапуск процесса вторую сводку не пришлёт. В WhatsApp не дублируется.
 */
export async function morningDigestTick(d: DigestDeps): Promise<boolean> {
  const now = d.now();
  const { minutes } = zonedParts(now);
  if (minutes < DIGEST_FROM_MIN || minutes >= DIGEST_UNTIL_MIN) return false;
  const day = zonedDay(now);
  if ((await d.sentDay()) === day || !(await d.enabled()) || !(await d.isWorkTime(now))) return false;
  await d.markSent(day);
  const text = digestText(await d.digest());
  if (!text) return false;
  await d.notify(text);
  return true;
}

export function morningDigestDeps(): DigestDeps {
  const c = container();
  return {
    now: () => new Date(),
    enabled: async () => (await getSetting("crm.digest")) !== "off",
    isWorkTime: (at) => c.workspace.schedule.isWorkTime(at),
    sentDay: () => getSetting("crm.digestDay"),
    markSent: (day) => c.workspace.settings.save({ "crm.digestDay": day }, null),
    digest: async () => c.reporting.morningDigest(Number(await getSetting("crm.slaMinutes")) || 15),
    notify: (n) => c.workspace.notifier.notifyAllWith("deals.view", { kind: "system", title: n.title, body: n.body, link: "/admin" }),
  };
}
