import { describe, expect, it } from "vitest";
import { clientFiltersFrom, clientFiltersQuery, monthAfter } from "@/modules/reporting/ui/clientFilters";

describe("фильтры клиентов для ручной добивки (contacts-13)", () => {
  const from = (q: Record<string, string>) => clientFiltersFrom((k) => q[k]);

  it("разбирает повод, месяц, период покупок и «без открытой сделки»; мусор отбрасывает", () => {
    expect(from({ occ: "valentine", month: "2", from: "2026-01", to: "2026-03", noDeal: "1" })).toEqual({ occasion: "valentine", month: 2, boughtFrom: "2026-01", boughtTo: "2026-03", noOpenDeal: true });
    expect(from({ occ: "drop table", month: "13", from: "2026-1", to: "март", noDeal: "yes" })).toEqual({});
    expect(from({})).toEqual({});
  });

  it("туда и обратно в адресную строку; правая граница периода — первое число следующего месяца", () => {
    const f = from({ occ: "march8", month: "3", from: "2025-12", to: "2026-03", noDeal: "1" });
    expect(from(Object.fromEntries(Object.entries(clientFiltersQuery(f)).filter(([, v]) => v)) as Record<string, string>)).toEqual(f);
    expect(monthAfter("2026-03")).toBe("2026-04-01");
    expect(monthAfter("2025-12")).toBe("2026-01-01");
  });
});
