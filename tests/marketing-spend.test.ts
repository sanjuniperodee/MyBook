import { describe, expect, it } from "vitest";
import { buildChannelReport, costPerLead, romi } from "@/modules/marketing/domain";

// Расходы на рекламу, стоимость заявки и ROMI (analytics-7).
describe("расход, стоимость заявки и ROMI по каналам", () => {
  const ig = { source: "instagram", medium: "cpc" };
  const report = buildChannelReport(
    [
      { source: ig, started: true, paid: true, revenue: 30000 },
      { source: ig, started: false, paid: false, revenue: 0 },
    ],
    [{ utm: ig, source: "whatsapp", clientId: null, won: true, amount: 25000, hasOrder: false, paid: 0 }],
    [],
    [
      { channel: "instagram", amount: 20000 },
      { channel: "instagram", amount: 10000 },
      { channel: "tiktok", amount: 5000 },
      { channel: "нет-такого", amount: 999 },
    ],
  );
  const by = (k: string) => report.channels.find((c) => c.key === k)!;

  it("расход суммируется по каналу; канал только с расходом — тоже в отчёте; незнакомый канал — нет", () => {
    expect(by("instagram").spend).toBe(30000);
    expect(by("tiktok")).toMatchObject({ spend: 5000, registrations: 0, revenue: 0 });
    expect(report.total.spend).toBe(35000);
    expect(report.channels.some((c) => c.label === undefined)).toBe(false);
  });

  it("стоимость заявки — расход на регистрации и заявки; ROMI — (выручка − расход) / расход; без расхода — нет", () => {
    expect(costPerLead(by("instagram"))).toBe(10000); // 30 000 на 2 регистрации и 1 заявку
    expect(romi(by("instagram"))).toBeCloseTo((55000 - 30000) / 30000);
    expect(romi(by("tiktok"))).toBe(-1);
    expect(costPerLead(by("tiktok"))).toBeNull();
    expect(romi({ clicks: 0, registrations: 1, startedBook: 0, leads: 0, sales: 1, revenue: 100 })).toBeNull();
  });
});
