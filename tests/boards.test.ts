import { describe, expect, it } from "vitest";
import { buildIcal, canEditCard, canManageBoard, canSeeBoard, canSeeCard, effectiveColumn, foldLine, matchesFilter, parseFilter, ruleDue, ruleMatches, validateRule, type BoardViewer } from "@/modules/boards/domain";
import { BOARD_TEMPLATES, nextOccurrence, positionBetween } from "@/shared/domain/boards";
import { icalEvent } from "@/modules/boards/application/CalendarService";

const viewer = (p: Partial<BoardViewer> = {}): BoardViewer => ({ userId: "me", name: "Я", seesAll: false, allTasks: false, manageBoards: false, ...p });
const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";

describe("доски: права", () => {
  it("общую видят все, закрытую — владелец, участник и руководитель досок", () => {
    expect(canSeeBoard(viewer(), { ownerId: "x", visibility: "all", memberRole: null })).toBe(true);
    expect(canSeeBoard(viewer(), { ownerId: "x", visibility: "members", memberRole: null })).toBe(false);
    expect(canSeeBoard(viewer(), { ownerId: "me", visibility: "members", memberRole: null })).toBe(true);
    expect(canSeeBoard(viewer(), { ownerId: "x", visibility: "members", memberRole: "member" })).toBe(true);
    expect(canSeeBoard(viewer({ manageBoards: true }), { ownerId: "x", visibility: "members", memberRole: null })).toBe(true);
    expect(canManageBoard(viewer(), { ownerId: "x", visibility: "all", memberRole: "member" })).toBe(false);
    expect(canManageBoard(viewer(), { ownerId: "x", visibility: "all", memberRole: "admin" })).toBe(true);
  });

  it("карточку о клиенте «только свои» видят как в «Задачах»: свою, ничью, где соисполнитель", () => {
    const base = { createdById: "y", clientLinked: true, memberIds: [] as string[] };
    expect(canSeeCard(viewer(), { ...base, assigneeId: "other" })).toBe(false);
    expect(canSeeCard(viewer(), { ...base, assigneeId: null })).toBe(true);
    expect(canSeeCard(viewer(), { ...base, assigneeId: "other", memberIds: ["me"] })).toBe(true);
    expect(canSeeCard(viewer({ seesAll: true }), { ...base, assigneeId: "other" })).toBe(true);
    // Внутренняя карточка (без клиента) — всем, кто видит доску, и менять её может любой.
    expect(canEditCard(viewer(), { ...base, clientLinked: false, assigneeId: "other", boardAdmin: false })).toBe(true);
    expect(canEditCard(viewer({ seesAll: true }), { ...base, assigneeId: "other", boardAdmin: false })).toBe(false);
    expect(canEditCard(viewer({ seesAll: true }), { ...base, assigneeId: "other", boardAdmin: true })).toBe(true);
  });
});

describe("доски: колонки и позиции", () => {
  const cols = [
    { id: "a", done: false },
    { id: "b", done: false },
    { id: "z", done: true },
  ];
  it("выполненная — в «Готово», открытая из «Готово» и без колонки — в первую", () => {
    expect(effectiveColumn(cols, null, false)).toBe("a");
    expect(effectiveColumn(cols, null, true)).toBe("z");
    expect(effectiveColumn(cols, "b", true)).toBe("z");
    expect(effectiveColumn(cols, "z", false)).toBe("a");
    expect(effectiveColumn(cols, "b", false)).toBe("b");
    expect(effectiveColumn([], "b", false)).toBeNull();
  });

  it("позиция между соседями — дробная, крайние — шагом 1024", () => {
    expect(positionBetween(null, null)).toBe(1024);
    expect(positionBetween(1024, 2048)).toBe(1536);
    expect(positionBetween(null, 1024)).toBe(0);
    expect(positionBetween(2048, null)).toBe(3072);
  });
});

describe("доски: правила", () => {
  it("событие подходит правилу: колонка совпадает, «появилась в любой» — всегда", () => {
    expect(ruleMatches({ type: "card.moved", columnId: "c1" }, { type: "card.moved", columnId: "c1" })).toBe(true);
    expect(ruleMatches({ type: "card.moved", columnId: "c1" }, { type: "card.moved", columnId: "c2" })).toBe(false);
    expect(ruleMatches({ type: "card.added" }, { type: "card.added", columnId: "c9" })).toBe(true);
    expect(ruleMatches({ type: "card.overdue" }, { type: "card.done" })).toBe(false);
  });

  it("проверка правила из формы: мусор отсекается, числа ограничены, пустой чек-лист без названия — ошибка", () => {
    const r = validateRule({ type: "card.moved", columnId: U1, extra: 1 }, [{ type: "set_due", days: 999, hours: -5 }, { type: "assign", userId: "mover" }, { type: "notify", to: "user", userId: U2, text: "  привет " }]);
    expect(r.trigger).toEqual({ type: "card.moved", columnId: U1 });
    expect(r.actions).toEqual([{ type: "set_due", days: 365, hours: 0 }, { type: "assign", userId: "mover" }, { type: "notify", to: "user", userId: U2, text: "привет" }]);
    expect(() => validateRule({ type: "card.moved" }, [{ type: "mark_done" }])).toThrow();
    expect(() => validateRule({ type: "card.done" }, [])).toThrow();
    expect(() => validateRule({ type: "card.done" }, [{ type: "rm -rf" }])).toThrow();
    expect(() => validateRule({ type: "card.done" }, [{ type: "add_checklist", title: " ", items: [] }])).toThrow();
  });

  it("срок из правила: дни без часов — к 18:00, 0/0 — убрать", () => {
    const now = new Date(2026, 10, 24, 10, 30);
    expect(ruleDue(now, { days: 0, hours: 0 })).toBeNull();
    expect(ruleDue(now, { days: 0, hours: 2 })).toEqual(new Date(2026, 10, 24, 12, 30));
    expect(ruleDue(now, { days: 7, hours: 0 })).toEqual(new Date(2026, 11, 1, 18, 0));
  });

  it("у каждого шаблона доски — колонка «Готово» и правило «срок прошёл → Просрочено»", () => {
    for (const t of BOARD_TEMPLATES) {
      expect(t.columns.filter((c) => c.done)).toHaveLength(1);
      expect(t.labels[0].name).toBe("Просрочено");
      expect(t.rules.some((r) => r.trigger.type === "card.overdue")).toBe(true);
      for (const r of t.rules) if ("column" in r.trigger && r.trigger.column != null) expect(t.columns[r.trigger.column]).toBeTruthy();
    }
  });
});

describe("доски: повтор", () => {
  it("каждый день, неделю, месяц (31-е → последний день), будни, до даты", () => {
    const d = new Date(2026, 0, 31, 9, 0);
    expect(nextOccurrence(d, { freq: "daily", interval: 2 })).toEqual(new Date(2026, 1, 2, 9, 0));
    expect(nextOccurrence(d, { freq: "weekly", interval: 1 })).toEqual(new Date(2026, 1, 7, 9, 0));
    expect(nextOccurrence(d, { freq: "monthly", interval: 1 })).toEqual(new Date(2026, 1, 28, 9, 0));
    const fri = new Date(2026, 10, 27, 9, 0);
    expect(nextOccurrence(fri, { freq: "weekdays", interval: 1 })).toEqual(new Date(2026, 10, 30, 9, 0));
    expect(nextOccurrence(fri, { freq: "daily", interval: 1, until: "2026-11-27" })).toBeNull();
  });
});

describe("доски: фильтр", () => {
  const now = new Date(2026, 10, 24, 12, 0);
  const card = { title: "Позвонить Алие", assigneeIds: ["me"], labelIds: ["L1"], priority: "high", dueAt: new Date(2026, 10, 24, 10, 0).toISOString(), doneAt: null, linkLabel: "Д42 · Алия" };
  it("строка адреса → фильтр: мусор отбрасывается", () => {
    expect(parseFilter({ q: " макет ", who: "me", label: `${U1},bad`, priority: "high,evil", due: "overdue", done: "1" })).toEqual({ q: "макет", who: "me", labels: [U1], priority: ["high"], due: "overdue", done: true });
    expect(parseFilter({ who: "drop table" }).who).toBeUndefined();
  });
  it("поиск, мои, метка, приоритет, просрочено", () => {
    expect(matchesFilter(card, { q: "д42" }, "me", now)).toBe(true);
    expect(matchesFilter(card, { q: "макет" }, "me", now)).toBe(false);
    expect(matchesFilter(card, { who: "me" }, "me", now)).toBe(true);
    expect(matchesFilter(card, { who: "none" }, "me", now)).toBe(false);
    expect(matchesFilter(card, { labels: ["L2"] }, "me", now)).toBe(false);
    expect(matchesFilter(card, { priority: ["none"] }, "me", now)).toBe(false);
    expect(matchesFilter(card, { due: "overdue" }, "me", now)).toBe(true);
    expect(matchesFilter({ ...card, doneAt: now.toISOString() }, { due: "overdue" }, "me", now)).toBe(false);
  });
});

describe("доски: iCal", () => {
  it("текст экранируется, длинные строки переносятся, срок «к 18:00» — событием на день", () => {
    expect(foldLine("x".repeat(80)).split("\r\n ")).toHaveLength(2);
    const ev = icalEvent({ id: "t1", title: "Встреча, звонок; итог (бот)", kind: "meeting", dueAt: new Date(2026, 10, 25, 18, 0), startAt: null, doneAt: null, updatedAt: new Date() }, "https://mybooks.kz");
    expect(ev.allDay).toBe(true);
    const ics = buildIcal("MyBooks CRM", [ev], new Date(Date.UTC(2026, 10, 24)));
    expect(ics).toContain("SUMMARY:Встреча\\, звонок\\; итог");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261125");
    expect(ics).toContain("URL:https://mybooks.kz/admin/tasks/t1");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    const timed = icalEvent({ id: "t2", title: "Звонок", kind: "call", dueAt: new Date(Date.UTC(2026, 10, 25, 5, 0)), startAt: null, doneAt: null, updatedAt: new Date() }, "https://mybooks.kz");
    expect(timed.allDay).toBe(false);
    expect(timed.end.getTime() - timed.start.getTime()).toBe(30 * 60_000);
  });
});
