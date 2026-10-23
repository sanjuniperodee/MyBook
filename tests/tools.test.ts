import { describe, expect, it } from "vitest";
import { calculatePrice } from "@/modules/ordering/domain/Pricing";
import { getAddons, getVisiblePlans } from "@/config/site";
import { calcPrice } from "@/lib/tools/price";
import { anniversaryDate, daysBetween, milestones, parseDay, togetherStats, weddingName } from "@/lib/tools/together";
import { deadlineView, holidays, upcomingHolidays } from "@/lib/tools/deadline";
import { generateGreeting, greetingData, occasionIds, occasionsFor, recipientIds } from "@/lib/tools/greeting";
import { questionsToAsk, quizBand, quizData, quizIds, quizPercent } from "@/lib/tools/quiz";
import { tools, getTool } from "@/lib/content/tools";
import { toolUi } from "@/lib/content/tools/ui";
import { articles } from "@/lib/content/articles";
import { locales } from "@/i18n/config";

const dup = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i);

describe("калькулятор цены повторяет серверный расчёт", () => {
  const plans = getVisiblePlans().map((p) => ({ id: p.id, price: p.price, extraCopyPrice: p.extraCopyPrice, printed: p.printed }));
  const addons = getAddons().map((a) => ({ id: a.id, price: a.price, hiddenFor: [...a.hiddenFor] }));
  for (const plan of plans)
    for (const copies of [1, 2, 5, 20, 99])
      for (const chosen of [[], ["giftwrap"], ["express", "giftwrap"]]) {
        it(`${plan.id} × ${copies} ${chosen.join("+") || "без допов"}`, () => {
          const server = calculatePrice(plan.id as "digital", copies, null, null, chosen);
          expect(calcPrice(plan, copies, addons, chosen).total).toBe(server.amount);
        });
      }
});

describe("счётчик «сколько мы вместе»", () => {
  it("парсит только настоящие даты", () => {
    expect(parseDay("2024-02-29")).not.toBeNull();
    expect(parseDay("2023-02-29")).toBeNull();
    expect(parseDay("2024-13-01")).toBeNull();
    expect(parseDay("мусор")).toBeNull();
  });

  it("дни, годы, месяцы", () => {
    const s = togetherStats(new Date(2020, 4, 14), new Date(2026, 9, 23));
    expect(s.years).toBe(6);
    expect(s.months).toBe(5);
    expect(s.restDays).toBe(9);
    expect(s.days).toBe(daysBetween(new Date(2020, 4, 14), new Date(2026, 9, 23)));
    expect(togetherStats(new Date(2025, 9, 23), new Date(2026, 9, 23))).toMatchObject({ years: 1, months: 0, restDays: 0, days: 365 });
  });

  it("день в день — ноль, переход на летнее время не сдвигает счёт", () => {
    expect(togetherStats(new Date(2026, 2, 28), new Date(2026, 2, 28)).days).toBe(0);
    expect(daysBetween(new Date(2026, 2, 28), new Date(2026, 3, 2))).toBe(5);
  });

  it("29 февраля в невисокосный год → 28 февраля", () => {
    const d = anniversaryDate(new Date(2024, 1, 29), 1);
    expect([d.getMonth(), d.getDate()]).toEqual([1, 28]);
  });

  it("круглые даты идут по порядку и включают ближайшую годовщину", () => {
    const start = new Date(2024, 0, 10);
    const now = new Date(2026, 9, 23);
    const list = milestones(start, now);
    const dates = list.map((m) => m.date.getTime());
    expect(dates).toEqual([...dates].sort((a, b) => a - b));
    expect(list.some((m) => m.inDays >= 0)).toBe(true);
    expect(list.filter((m) => m.inDays < 0).length).toBeLessThanOrEqual(2);
  });

  it("названия годовщин", () => {
    expect(weddingName(1, "ru")).toBe("Ситцевая");
    expect(weddingName(25, "kk")).toBe("Күміс");
    expect(weddingName(16, "ru")).toBeNull();
  });
});

describe("успеть к празднику", () => {
  const now = new Date(2026, 9, 23);
  it("вердикты", () => {
    expect(deadlineView("2026-09-01", now, "courier", true)?.verdict).toBe("past");
    expect(deadlineView("2026-12-31", now, "courier", true)?.verdict).toBe("relaxed");
    expect(deadlineView("2026-10-25", now, "courier", false)?.verdict).toBe("digital");
    expect(deadlineView("2026-13-45", now, "courier", false)).toBeNull();
  });
  it("праздники: ближайшие даты не раньше сегодня и по порядку", () => {
    const list = upcomingHolidays(now);
    expect(list).toHaveLength(holidays.length);
    expect(list.every((h) => h.date >= new Date(2026, 9, 23))).toBe(true);
    expect(list.map((h) => h.date.getTime())).toEqual(list.map((h) => h.date.getTime()).sort((a, b) => a - b));
  });
});

describe("генератор поздравлений", () => {
  for (const locale of locales) {
    it(`${locale}: у каждого получателя достаточно заготовок, поводы есть`, () => {
      const d = greetingData[locale];
      for (const r of recipientIds) {
        const p = d.recipients[r];
        expect(p.warm.length, r).toBeGreaterThanOrEqual(5);
        expect(p.funny.length, r).toBeGreaterThanOrEqual(3);
        expect(p.plain.length, r).toBeGreaterThan(0);
        expect(p.named.every((s) => s.includes("{name}") || p.plain.includes(s)), r).toBe(true);
        for (const o of occasionsFor(r)) expect(d.occasions[o], `${r}/${o}`).toBeTruthy();
      }
      for (const o of occasionIds) expect(d.occasions[o].titles.length).toBeGreaterThan(0);
    });

    it(`${locale}: тексты детерминированы, варианты отличаются, шаблоны подставлены`, () => {
      for (const r of recipientIds)
        for (const o of occasionsFor(r))
          for (const tone of ["warm", "funny"] as const) {
            const base = { locale, recipient: r, occasion: o, tone, name: "Айгуль", age: 60 };
            const a = generateGreeting(base);
            expect(generateGreeting(base)).toBe(a);
            expect(a).not.toMatch(/\{|\}|undefined/);
            expect(a.length).toBeGreaterThan(80);
            expect(generateGreeting({ ...base, short: true }).length).toBeLessThan(a.length);
          }
      const variants = new Set([0, 1, 2, 3, 4, 5].map((variant) => generateGreeting({ locale, recipient: "mama", occasion: "birthday", tone: "warm", variant })));
      expect(variants.size).toBeGreaterThan(2);
    });
  }

  it("возраст попадает в юбилей, без имени — обращение без имени", () => {
    expect(generateGreeting({ locale: "ru", recipient: "mama", occasion: "jubilee", tone: "warm", age: 60 })).toContain("60");
    expect(generateGreeting({ locale: "ru", recipient: "zhena", occasion: "birthday", tone: "warm" })).not.toContain("{name}");
    expect(generateGreeting({ locale: "ru", recipient: "zhena", occasion: "birthday", tone: "warm", name: "Данара" })).toContain("Данара");
  });
});

describe("тесты «как хорошо вы знаете…»", () => {
  for (const locale of locales)
    for (const id of quizIds)
      it(`${locale}/${id}: десять утверждений с вопросами`, () => {
        const q = quizData[locale][id];
        expect(q.items).toHaveLength(10);
        expect(dup(q.items.map((i) => i.ask))).toEqual([]);
        for (const it of q.items) expect(it.ask.trim().endsWith("?") || it.ask.trim().endsWith("!") || it.ask.trim().endsWith(".")).toBe(true);
      });

  it("баллы, уровни и список вопросов", () => {
    expect(quizPercent([2, 2, 2, 2], 4)).toBe(100);
    expect(quizPercent([], 10)).toBe(0);
    expect(quizPercent([1, 1, 1, 1], 4)).toBe(50);
    expect([0, 34, 35, 59, 60, 84, 85, 100].map(quizBand)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    const items = quizData.ru.mama.items;
    const ask = questionsToAsk(items, [2, 1, 0, 2, 0, 2, 2, 2, 2, 2]);
    expect(ask.map((a) => a.level)).toEqual([0, 0, 1]);
    expect(ask.map((a) => a.ask)).toEqual([items[2].ask, items[4].ask, items[1].ask]);
    expect(ask.every((a) => a.level < 2)).toBe(true);
  });
});

describe("реестр инструментов", () => {
  it("адреса уникальны, пригодны для URL, у каждого есть тексты на обоих языках", () => {
    expect(dup(tools.map((t) => t.slug))).toEqual([]);
    for (const t of tools) {
      expect(t.slug).toMatch(/^[a-z0-9-]+$/);
      for (const locale of locales) {
        const c = t.content[locale];
        expect(c.metaTitle.length, c.metaTitle).toBeLessThanOrEqual(80);
        expect(c.metaDescription.length, c.metaDescription).toBeGreaterThanOrEqual(80);
        expect(c.metaDescription.length, c.metaDescription).toBeLessThanOrEqual(200);
        expect(c.faq.length).toBeGreaterThanOrEqual(3);
        expect(c.sections.length).toBeGreaterThan(0);
        expect(c.teaser.length).toBeGreaterThan(20);
      }
    }
    for (const locale of locales) {
      const c = tools.map((t) => t.content[locale]);
      expect(dup(c.map((x) => x.metaTitle))).toEqual([]);
      expect(dup(c.map((x) => x.metaDescription))).toEqual([]);
      expect(dup(c.map((x) => `${x.h1} ${x.accent}`))).toEqual([]);
    }
  });

  it("у каждого теста есть вопросы, а у каждого вида — подписи интерфейса", () => {
    for (const t of tools.filter((x) => x.kind === "quiz")) expect(quizIds).toContain(t.quiz);
    expect(new Set(tools.filter((x) => x.kind === "quiz").map((t) => t.quiz)).size).toBe(quizIds.length);
    for (const locale of locales) {
      const ui = toolUi[locale];
      expect(Object.keys(ui.greeting.recipient).sort()).toEqual([...recipientIds].sort());
      expect(Object.keys(ui.greeting.occasion).sort()).toEqual([...occasionIds].sort());
      expect(Object.keys(ui.deadline.holiday).sort()).toEqual(holidays.map((h) => h.id).sort());
    }
  });

  it("статьи ссылаются только на существующие инструменты", () => {
    for (const a of articles) for (const slug of a.tools ?? []) expect(getTool(slug), `${a.slug} → ${slug}`).toBeTruthy();
  });
});
