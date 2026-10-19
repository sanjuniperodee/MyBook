import { describe, expect, it } from "vitest";
import { dealScreen } from "@/modules/reporting/ui/deal-screen";
import { clientScreen } from "@/modules/reporting/ui/client-screen";
import { DEFAULT_SLA_MINUTES, responseWait, shiftMinutes, slaMinutes, waitLabel } from "@/modules/reporting/ui/response-wait";
import { parseWorkHours } from "@/shared/domain/schedule";
import { formatDate } from "@/lib/dates";

/** Модели экранов CRM (D7): страницы загружают данные, эти функции готовят их для секций. */
const now = new Date("2026-05-10T09:00:00Z");
const staff = [{ id: "m1", name: "Айгерим", email: "a@b.kz" }];
const stage = (id: string, pipelineId: string, kind = "open") => ({ id, pipelineId, name: id, color: "#000", kind });

describe("dealScreen", () => {
  const base = {
    deal: { stageId: "s2", assigneeId: null, utm: null, source: "site" },
    stages: [stage("s1", "p1"), stage("s2", "p1", "won"), stage("x1", "p2")],
    staff,
    tasks: [],
    notes: [],
    payments: [],
    receipts: [],
    calls: [],
    now,
  };

  it("этапы — только воронки сделки; задачи со сроком и временем, просроченные; история — автор или «система»", () => {
    const s = dealScreen({
      ...base,
      tasks: [{ id: "t1", kind: "call", title: "Позвонить", dueAt: new Date("2026-05-09T10:00:00Z"), doneAt: null, assigneeId: "m1" }],
      notes: [
        { id: "n1", kind: "note", text: "Заметка", authorId: "m1", createdAt: now },
        { id: "n2", kind: "system", text: "Создана", authorId: null, createdAt: now },
      ],
    });
    expect(s.pipelineId).toBe("p1");
    expect(s.stages.map((x) => x.id)).toEqual(["s1", "s2"]);
    expect(s.stage?.kind).toBe("won");
    expect(s.tasks).toEqual([{ id: "t1", kind: "call", title: "Позвонить", dueLabel: `до ${formatDate(new Date("2026-05-09T10:00:00Z"), true)}`, overdue: true, done: false, assignee: "Айгерим" }]);
    expect(s.notes.map((n) => n.author)).toEqual(["Айгерим", "система"]);
  });

  it("платежи с чеками своего платежа; звонки: вид, длительность, сотрудник", () => {
    const s = dealScreen({
      ...base,
      payments: [{ id: "p1", amount: 5000, kind: "prepayment", paidAt: now, createdById: null, note: "" }],
      receipts: [
        { id: "r1", paymentId: "p1", fileName: "чек.pdf", mime: "application/pdf" },
        { id: "r2", paymentId: null, fileName: "x.jpg", mime: "image/jpeg" },
      ],
      calls: [
        { id: "c1", direction: "out", status: "answered", startedAt: now, durationSec: 125, staffId: "m1", hasRecording: true },
        { id: "c2", direction: "in", status: "missed", startedAt: now, durationSec: 0, staffId: null, hasRecording: false },
      ],
    });
    expect(s.payments).toEqual([{ id: "p1", amount: 5000, kind: "prepayment", dateLabel: formatDate(now), author: "система", note: "", online: null, receipts: [{ id: "r1", fileName: "чек.pdf", isPdf: true }] }]);
    expect(s.calls.map(({ icon, missed, label, duration, staff: who }) => ({ icon, missed, label, duration, who }))).toEqual([
      { icon: "out", missed: false, label: "Исходящий", duration: "2:05", who: "Айгерим" },
      { icon: "missed", missed: true, label: "Пропущенный", duration: null, who: undefined },
    ]);
  });

  it("канал привлечения: метки и ссылка в подробностях", () => {
    expect(dealScreen(base).channel.details).toBe("");
    const s = dealScreen({ ...base, deal: { ...base.deal, utm: { source: "instagram", medium: "cpc", link: "ig-bio" } } });
    expect(s.channel.details).toContain("ссылка ig-bio");
  });
});

describe("clientScreen", () => {
  const base = {
    client: { phone: null, source: null, remindedAt: null },
    staff,
    tasks: [],
    notes: [],
    orders: [] as { id: string; number: number; status: string; contactPhone: string | null }[],
    books: [] as { book: { status: string } }[],
    money: { total: 0, sales: 0 },
    remindAllowed: true,
    now,
  };

  it("телефон — из профиля, иначе из последнего заказа; задачи и история со ссылкой на заказ", () => {
    const s = clientScreen({
      ...base,
      orders: [{ id: "o1", number: 12, status: "paid", contactPhone: "+7 701 000 00 00" }],
      tasks: [{ id: "t1", title: "Т", dueAt: null, doneAt: now, assigneeId: null, orderId: "o1" }],
      notes: [{ id: "n1", kind: "note", text: "x", authorId: null, createdAt: now, orderId: "o9" }],
    });
    expect(s.rawPhone).toBe("+7 701 000 00 00");
    expect(s.phoneDigits).toBe("77010000000");
    expect(s.tasks[0]).toEqual({ id: "t1", title: "Т", dueLabel: null, overdue: false, done: true, assignee: null, context: { label: "заказ №12", href: "/admin/orders/o1" } });
    expect(s.notes[0].orderLabel).toBeNull();
  });

  it("покупки: LTV, заказы без отменённых, средний чек; канал: ручной, по меткам или пусто", () => {
    const s = clientScreen({ ...base, money: { total: 90_000, sales: 4 }, orders: [{ id: "o1", number: 1, status: "cancelled", contactPhone: null }, { id: "o2", number: 2, status: "paid", contactPhone: null }] });
    expect(s.stats).toEqual({ ltv: 90_000, orders: 1, books: 0, averageCheck: 22_500 });
    expect(clientScreen(base).stats.averageCheck).toBeNull();
    expect(clientScreen(base).channel.value).toBe("");
    expect(clientScreen({ ...base, client: { ...base.client, source: { source: "instagram", medium: "cpc" } } }).channel.value).toBe("auto");
  });

  it("напоминание: нет черновиков — нельзя; недавно напоминали — нельзя, подсказка с датой", () => {
    expect(clientScreen(base).remind).toEqual({ disabled: true, hint: "Нет незавершённых книг" });
    const draft = { ...base, books: [{ book: { status: "draft" } }] };
    expect(clientScreen(draft).remind).toEqual({ disabled: false, hint: "Письмо со ссылкой на следующий вопрос" });
    expect(clientScreen({ ...draft, remindAllowed: false, client: { ...base.client, remindedAt: now } }).remind).toEqual({ disabled: true, hint: `Последнее напоминание: ${formatDate(now, true)}` });
  });
});

describe("ожидание ответа в «Чатах» и «Моём дне» — рабочие минуты и норматив из настроек (tasks-d6)", () => {
  const tz = "Asia/Almaty"; // UTC+5
  const daily = parseWorkHours('{"days":[1,2,3,4,5,6,7],"from":"09:00","to":"21:00"}');
  const at = (local: string) => new Date(`${local}+05:00`);

  it("клиент написал ночью — утром ожидание считается от начала смены, а не «просрочено» с 23:00", () => {
    const since = at("2026-10-18T23:00");
    expect(responseWait(since, at("2026-10-19T09:10"), daily, 15, tz)).toEqual({ minutes: 10, overdue: false, label: "10 мин" });
    expect(responseWait(since, at("2026-10-19T09:20"), daily, 15, tz)).toEqual({ minutes: 20, overdue: true, label: "20 мин" });
    // Ночью ожидание не идёт.
    expect(responseWait(since, at("2026-10-19T03:00"), daily, 15, tz)).toMatchObject({ minutes: 0, overdue: false });
  });

  it("днём — порог из настроек: ровно норматив уже просрочен; выходной по графику не считается", () => {
    const since = at("2026-10-19T10:00");
    expect(responseWait(since, at("2026-10-19T10:14"), daily, 15, tz).overdue).toBe(false);
    expect(responseWait(since, at("2026-10-19T10:15"), daily, 15, tz).overdue).toBe(true);
    expect(responseWait(since, at("2026-10-19T10:20"), daily, 30, tz).overdue).toBe(false);
    // Пн–Пт: написал в субботу днём — в понедельник 09:05 ждёт 5 минут.
    const weekdays = parseWorkHours('{"days":[1,2,3,4,5],"from":"09:00","to":"18:00"}');
    expect(responseWait(at("2026-10-17T12:00"), at("2026-10-19T09:05"), weekdays, 15, tz)).toMatchObject({ minutes: 5, overdue: false });
  });

  it("норматив из crm.slaMinutes: целое от 1, иначе 15; подпись ожидания", () => {
    expect(slaMinutes("30")).toBe(30);
    for (const raw of [null, undefined, "", "0", "-5", "abc", "2.5"]) expect(slaMinutes(raw)).toBe(DEFAULT_SLA_MINUTES);
    expect([0, 59, 60, 65, 1439, 2880].map((m) => waitLabel(m))).toEqual(["0 мин", "59 мин", "1 ч", "1 ч 5 мин", "23 ч 59 мин", "48 ч"]);
    // Минуты рабочие: «день» — смена графика, а не сутки. При 09:00–21:00 сутки рабочих минут — два рабочих дня.
    expect([719, 720, 1440, 2160].map((m) => waitLabel(m, shiftMinutes({ from: "09:00", to: "21:00" })))).toEqual(["11 ч 59 мин", "1 раб. дн", "2 раб. дн", "3 раб. дн"]);
    expect(shiftMinutes({ from: "20:00", to: "02:00" })).toBe(360);
    expect(shiftMinutes({ from: "00:00", to: "00:00" })).toBe(1440);
  });
});
