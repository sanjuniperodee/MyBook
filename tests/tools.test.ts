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

describe("проверка фото для печати", () => {
  it("тот же расчёт, что у редактора: 12 Мп хватает на всю страницу A5, 1600 px — нет", async () => {
    const { analyzePhoto, looksMessengerCompressed } = await import("@/lib/tools/photos");
    const big = analyzePhoto({ width: 4000, height: 3000 }, "a5");
    expect(big.uses.find((u) => u.id === "bleed")!.verdict).not.toBe("low");
    expect(big.uses.find((u) => u.id === "half")!.verdict).toBe("great");
    const small = analyzePhoto({ width: 1600, height: 1200 }, "a5");
    expect(small.worst).toBe("low");
    expect(small.uses.find((u) => u.id === "bleed")!.dpi).toBeLessThan(150);
    expect(analyzePhoto({ width: 4000, height: 3000 }, "square").uses).toHaveLength(5);
    expect(big.maxCm.sharp).toBeLessThan(big.maxCm.soft);
    expect(looksMessengerCompressed("IMG-20240101-WA0001.jpg", { width: 1600, height: 1200 })).toBe(true);
    expect(looksMessengerCompressed("IMG_1234.jpg", { width: 4000, height: 3000 })).toBe(false);
  });
});

describe("объём книги", () => {
  it("минимум 24 полосы, кратно четырём, больше материала — больше полос и толще корешок", async () => {
    const { estimateBook, answersToGood } = await import("@/lib/tools/pages");
    const base = { format: "a5", length: "medium", photos: 0, letters: 0 } as const;
    const a = estimateBook({ ...base, answers: 5 });
    const b = estimateBook({ ...base, answers: 30 });
    const c = estimateBook({ ...base, answers: 60, photos: 20 });
    for (const s of [a, b, c]) {
      expect(s.pages).toBeGreaterThanOrEqual(24);
      expect(s.pages % 4).toBe(0);
    }
    expect(b.raw).toBeGreaterThan(a.raw);
    expect(c.pages).toBeGreaterThan(b.pages);
    expect(c.spineMm).toBeGreaterThan(a.spineMm);
    expect(estimateBook({ ...base, answers: 30, length: "long" }).raw).toBeGreaterThan(b.raw);
    expect(estimateBook({ ...base, answers: 0 }).pages).toBe(0);
    expect(answersToGood({ ...base, answers: 100 })).toBe(0);
    expect(answersToGood({ ...base, answers: 3 })).toBeGreaterThan(0);
  });
});

describe("календарь .ics", () => {
  it("события на весь день, экранирование и перенос длинных строк по байтам", async () => {
    const { buildIcs, icsEscape, icsFold } = await import("@/lib/tools/ics");
    expect(icsEscape("а, б; в\nг\\д")).toBe("а\\, б\\; в\\nг\\\\д");
    const long = "SUMMARY:" + "я".repeat(80);
    const folded = icsFold(long);
    for (const line of folded.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(long);
    const ics = buildIcs([{ uid: "a@x", date: new Date(2026, 11, 31), summary: "Заказать, книгу" }], { calendarName: "План", now: new Date(Date.UTC(2026, 9, 23, 7, 0, 0)) });
    expect(ics).toContain("DTSTART;VALUE=DATE:20261231");
    expect(ics).toContain("DTEND;VALUE=DATE:20270101");
    expect(ics).toContain("DTSTAMP:20261023T070000Z");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

describe("план книги к дате", () => {
  const now = new Date(2026, 9, 23);
  const base = { delivery: "courier", now, goal: "normal", letters: true, expressAvailable: true } as const;
  it("вердикты по запасу времени", async () => {
    const { planFor } = await import("@/lib/tools/plan");
    expect(planFor({ ...base, target: "2026-09-01" })?.verdict).toBe("past");
    const calm = planFor({ ...base, target: "2027-03-08" })!;
    expect(calm.verdict).toBe("calm");
    expect(calm.perDay).toBeLessThanOrEqual(2);
    expect(planFor({ ...base, target: "2026-11-20", goal: "big" })!.verdict).not.toBe("calm");
    expect(planFor({ ...base, target: "2026-10-25", expressAvailable: false })!.verdict).toBe("digital");
    expect(planFor({ ...base, target: "не дата" })).toBeNull();
  });
  it("шаги идут по порядку, не раньше сегодня и не позже дня заказа", async () => {
    const { planFor } = await import("@/lib/tools/plan");
    for (const target of ["2026-11-10", "2026-12-31", "2027-03-08", "2026-10-30"]) {
      const p = planFor({ ...base, target })!;
      const t = p.steps.map((s) => s.date.getTime());
      expect(t).toEqual([...t].sort((a, b) => a - b));
      expect(p.steps[0].date.getTime()).toBe(now.getTime());
      const order = p.steps.find((s) => s.id === "order")!.date.getTime();
      expect(p.steps.filter((s) => s.id !== "target").every((s) => s.date.getTime() <= order)).toBe(true);
    }
    expect(planFor({ ...base, target: "2027-03-08", letters: false })!.steps.some((s) => s.id === "letters")).toBe(false);
  });
});

describe("шежіре", () => {
  it("сохранённое читается устойчиво", async () => {
    const { parseShezhire, emptyShezhire, knownChain, filled, GENERATIONS } = await import("@/lib/tools/shezhire");
    expect(parseShezhire(null)).toEqual(emptyShezhire());
    expect(parseShezhire("{не json")).toEqual(emptyShezhire());
    expect(parseShezhire("42")).toEqual(emptyShezhire());
    const s = parseShezhire(JSON.stringify({ owner: "А".repeat(500), father: [{ name: "Серік" }, { name: "" }, { name: "Қали" }], mother: "мусор" }));
    expect(s.owner).toHaveLength(80);
    expect(s.father).toHaveLength(GENERATIONS);
    expect(s.mother).toHaveLength(GENERATIONS);
    expect(knownChain(s.father)).toBe(1);
    expect(filled(s.father)).toBe(2);
  });
});

describe("шежіре: список имён и глубина плаката", () => {
  it("разбирает вставленный текст", async () => {
    const { parseNames, posterDepth, emptyShezhire } = await import("@/lib/tools/shezhire");
    expect(parseNames("Серік, Қали; Омар\nТөлеген")).toEqual(["Серік", "Қали", "Омар", "Төлеген"]);
    expect(parseNames("Серік Қали Омар")).toEqual(["Серік", "Қали", "Омар"]);
    expect(parseNames("Серік → Қали → Омар")).toEqual(["Серік", "Қали", "Омар"]);
    expect(parseNames("Нұрлан Серікұлы, Қали")).toEqual(["Нұрлан Серікұлы", "Қали"]);
    expect(parseNames("")).toEqual([]);
    expect(parseNames("а б в г д е ж з и")).toHaveLength(7);
    const s = emptyShezhire();
    expect(posterDepth(s.father)).toBe(0);
    s.father[2].name = "Омар";
    expect(posterDepth(s.father)).toBe(3);
  });
});

describe("мүшел жас", () => {
  it("животное года: 2000 — дракон, 1996 — крыса, 2007 — свинья, до нашей эры не ломается", async () => {
    const { animalOf, mushelInfo } = await import("@/lib/tools/mushel");
    expect(animalOf(2000)).toBe("dragon");
    expect(animalOf(1996)).toBe("rat");
    expect(animalOf(2007)).toBe("pig");
    expect(animalOf(1900)).toBe("rat");
    expect(animalOf(-100)).toBeTruthy();
    const info = mushelInfo(1977, 5, 14, new Date(2026, 9, 23));
    expect(info.age).toBe(49);
    expect(info.traditionalAge).toBe(50);
    expect(info.rounds.map((r) => r.year).slice(0, 5)).toEqual([1989, 2001, 2013, 2025, 2037]);
    expect(info.rounds[3].traditionalAge).toBe(49);
    expect(info.next?.year).toBe(2037);
    expect(mushelInfo(1990, 12, 1, new Date(2026, 9, 23)).age).toBe(35);
    expect(mushelInfo(1938, 1, 1, new Date(2026, 9, 23)).next).toBeNull();
  });
});

describe("семейный календарь", () => {
  const now = new Date(2026, 9, 23);
  it("читает сохранённое устойчиво", async () => {
    const { parsePeople } = await import("@/lib/tools/family");
    expect(parsePeople(null)).toEqual([]);
    expect(parsePeople("не json")).toEqual([]);
    expect(parsePeople(JSON.stringify([{ name: "Мама", birth: "1970-02-30" }, { name: "Папа", birth: "1968-04-01", id: "x" }, 5]))).toHaveLength(1);
  });
  it("ближайший день рождения и мүшел", async () => {
    const { personRow, nextBirthday } = await import("@/lib/tools/family");
    const r = personRow({ id: "a", name: "Мама", relation: "mom", birth: "1977-05-14" }, now)!;
    expect(r.age).toBe(49);
    expect(r.turning).toBe(50);
    expect(r.nextBirthday.getFullYear()).toBe(2027);
    expect(r.daysToBirthday).toBeGreaterThan(0);
    expect(r.mushel?.year).toBe(2037);
    // день рождения сегодня — «через 0 дней»
    expect(nextBirthday(new Date(1990, 9, 23), now).date.getFullYear()).toBe(2026);
    // 29 февраля
    expect(nextBirthday(new Date(2000, 1, 29), new Date(2026, 9, 23)).date).toEqual(new Date(2027, 1, 28));
  });
  it("события календаря: годовое повторение и напоминания", async () => {
    const { personRow, familyEvents, rowsFor } = await import("@/lib/tools/family");
    const { buildIcs } = await import("@/lib/tools/ics");
    const rows = rowsFor([{ id: "a", name: "Мама", relation: "mom", birth: "1977-05-14" }, { id: "b", name: "Лея", relation: "", birth: "2000-02-29" }], now);
    const ev = familyEvents(rows, { birthday: (n, a) => `ДР ${n} ${a}`, birthdayDescription: () => "", alarmWeeks: (n) => `скоро ${n}`, alarmDay: (n) => `завтра ${n}`, mushel: (n, a) => `мүшел ${n} ${a}`, mushelAlarm: () => "готовьтесь", animal: (a) => a }, 14);
    expect(ev.filter((e) => e.rrule).map((e) => e.rrule)).toContain("FREQ=YEARLY");
    expect(ev.find((e) => e.uid === "bd-b@mybook.kz")?.rrule).toBe("FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1");
    const ics = buildIcs(ev, { calendarName: "Семья", now });
    expect(ics).toContain("RRULE:FREQ=YEARLY");
    expect(ics).toContain("TRIGGER;RELATED=START:-P14D");
    expect(ics.match(/BEGIN:VALARM/g)!.length).toBe(ev.reduce((n, e) => n + (e.alarms?.length ?? 1), 0));
    expect(personRow({ id: "z", name: "?", relation: "", birth: "нет" }, now)).toBeNull();
  });
});
