import { describe, expect, it } from "vitest";
import { deadlineFor, getOccasion, nextFixedDate, occasionsFor, orderByDate, subtractWorkdays, toIsoDay } from "@/lib/occasions";

describe("поводы под тему книги", () => {
  const ids = (theme: string, iso: string, selected?: string) => occasionsFor(theme, new Date(iso), selected).map((o) => o.id);

  it("маме — без «Годовщины» и «14 февраля», «Другой повод» — последним", () => {
    const mom = ids("mom", "2026-06-10T10:00:00");
    expect(mom).not.toContain("anniversary");
    expect(mom).not.toContain("valentine");
    expect(mom[0]).toBe("birthday");
    expect(mom.at(-1)).toBe("other");
  });

  it("ближайший праздник — первым", () => {
    expect(ids("mom", "2026-02-10T10:00:00")[0]).toBe("march8");
    expect(ids("love", "2026-01-20T10:00:00")[0]).toBe("valentine");
    expect(ids("dad", "2026-12-01T10:00:00")[0]).toBe("newyear");
    expect(ids("love", "2026-06-10T10:00:00")[0]).toBe("anniversary");
  });

  it("выбранный раньше повод не пропадает, неизвестная тема — все поводы", () => {
    const withValentine = ids("mom", "2026-06-10T10:00:00", "valentine");
    expect(withValentine).toContain("valentine");
    expect(withValentine.at(-1)).toBe("other");
    expect(ids("unknown", "2026-06-10T10:00:00")).toHaveLength(9);
  });
});

describe("occasions", () => {
  it("next fixed date rolls over to next year", () => {
    const v = getOccasion("valentine")!;
    expect(nextFixedDate(v, new Date(2027, 0, 10))).toBe("2027-02-14");
    expect(nextFixedDate(v, new Date(2027, 1, 14))).toBe("2027-02-14");
    expect(nextFixedDate(v, new Date(2027, 1, 15))).toBe("2028-02-14");
    expect(nextFixedDate(getOccasion("birthday")!, new Date())).toBeNull();
  });

  it("skips weekends when subtracting workdays", () => {
    // понедельник 8 марта 2027 − 1 рабочий день = пятница 5 марта
    expect(toIsoDay(subtractWorkdays(new Date(2027, 2, 8), 1))).toBe("2027-03-05");
    expect(toIsoDay(subtractWorkdays(new Date(2027, 2, 10), 5))).toBe("2027-03-03");
  });

  it("order-by date accounts for production and delivery", () => {
    const std = orderByDate("2027-02-14", "hardcover", "courier");
    const prem = orderByDate("2027-02-14", "premium", "courier");
    const post = orderByDate("2027-02-14", "hardcover", "post");
    expect(prem > std).toBe(true);
    expect(post < std).toBe(true);
  });

  it("classifies deadline states", () => {
    expect(deadlineFor("2027-03-30", new Date(2027, 0, 1)).state).toBe("relaxed");
    const target = "2027-02-14";
    const std = orderByDate(target, "hardcover", "courier");
    const soon = new Date(std.getTime() - 5 * 86_400_000);
    expect(deadlineFor(target, soon).state).toBe("soon");
    expect(deadlineFor(target, std).state).toBe("urgent");
    const prem = orderByDate(target, "premium", "courier");
    expect(deadlineFor(target, prem).state).toBe("premium");
    expect(deadlineFor(target, new Date(2027, 1, 13)).state).toBe("digital");
    expect(deadlineFor(target, new Date(2027, 1, 15)).state).toBe("past");
  });
});

import { calculatePrice } from "@/modules/ordering/domain/Pricing";

describe("addons pricing", () => {
  it("adds addons only where available and never discounts them", () => {
    const p = calculatePrice("hardcover", 1, "courier", { kind: "fixed", value: 24900 }, ["express", "giftwrap"]);
    expect(p.addons).toEqual(["express", "giftwrap"]);
    expect(p.discountAmount).toBe(24900);
    expect(p.amount).toBe(p.deliveryAmount + p.addonsAmount);
    const prem = calculatePrice("premium", 1, "courier", null, ["express", "giftwrap"]);
    expect(prem.addons).toEqual([]);
    expect(prem.addonsAmount).toBe(0);
    const dig = calculatePrice("digital", 1, null, null, ["express", "bogus"]);
    expect(dig.amount).toBe(dig.itemsAmount);
  });
});
