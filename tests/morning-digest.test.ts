import { describe, expect, it } from "vitest";
import { digestText, morningDigestTick, type DigestDeps } from "@/server/morning-digest";
import { storeTimeZoneIs } from "./doubles/time";

// Утренняя сводка сотрудникам (bots-11, analytics-4).
storeTimeZoneIs("Asia/Almaty");
const digest = { waiting: 3, claims: 1, deadlines: 2, botChats: 5, botHandoffs: 2 };

function deps(over: Partial<DigestDeps> & { at?: string } = {}) {
  const sent: { title: string; body: string }[] = [];
  let day = "";
  const d: DigestDeps = {
    now: () => new Date(over.at ?? "2026-10-02T04:05:00Z"), // 09:05 по Алматы
    enabled: async () => true,
    isWorkTime: async () => true,
    sentDay: async () => day,
    markSent: async (x) => void (day = x),
    digest: async () => digest,
    notify: async (n) => void sent.push(n),
    ...over,
  };
  return { d, sent, day: () => day };
}

describe("утренняя сводка", () => {
  it("текст — только про то, что есть; пусто — без уведомления", () => {
    expect(digestText(digest)?.body).toBe("• ждут ответа дольше норматива: 3\n• клиент сообщил об оплате — проверить: 1\n• дата события в ближайшие 3 дня: 2\n• бот за ночь вёл бесед: 5, передал вам: 2");
    expect(digestText({ waiting: 0, claims: 0, deadlines: 1, botChats: 0, botHandoffs: 0 })?.body).toBe("• дата события в ближайшие 3 дня: 1");
    expect(digestText({ waiting: 0, claims: 0, deadlines: 0, botChats: 0, botHandoffs: 0 })).toBeNull();
  });

  it("с 09:00 в рабочий день — одна в сутки; до девяти, после полудня, в выходной и выключенная — нет", async () => {
    const t = deps();
    expect(await morningDigestTick(t.d)).toBe(true);
    expect(await morningDigestTick(t.d)).toBe(false);
    expect(t.sent).toHaveLength(1);
    expect(t.day()).toBe("2026-10-02");
    for (const over of [{ at: "2026-10-02T03:55:00Z" }, { at: "2026-10-02T07:01:00Z" }, { isWorkTime: async () => false }, { enabled: async () => false }]) {
      const x = deps(over);
      expect(await morningDigestTick(x.d)).toBe(false);
      expect(x.sent).toEqual([]);
    }
  });

  it("сообщать нечего — день отмечен, уведомления нет", async () => {
    const t = deps({ digest: async () => ({ waiting: 0, claims: 0, deadlines: 0, botChats: 0, botHandoffs: 0 }) });
    expect(await morningDigestTick(t.d)).toBe(false);
    expect(t.day()).toBe("2026-10-02");
    expect(t.sent).toEqual([]);
  });
});
