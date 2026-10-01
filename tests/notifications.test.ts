import { describe, expect, it } from "vitest";
import type { Mailer } from "@/shared/application";
import { ALMOST_READY_ANSWERS, canRemind, draftEmails, isSendingHour, type DraftProgress } from "@/modules/notifications/domain";
import { BookRemindersService, LifecycleService, SubscriptionsService, type DraftCandidate, type EmailTemplates, type LifecycleSource, type OrderReminder, type Recipient, type RecipientRepository } from "@/modules/notifications/application";

const DAY = 86_400_000;
const now = new Date("2026-10-01T08:00:00Z"); // 13:00 в Алматы

const book = (p: Partial<DraftProgress> = {}): DraftProgress => ({
  bookId: "b1",
  title: "Книга",
  occasion: null,
  occasionDate: null,
  updatedAt: new Date(now.getTime() - 10 * DAY),
  answered: 0,
  firstEmpty: 0,
  hasOrder: false,
  remindedAt: null,
  ...p,
});

describe("правила автописем", () => {
  it("письма уходят только днём по Алматы", () => {
    expect(isSendingHour(now)).toBe(true);
    expect(isSendingHour(new Date("2026-10-01T18:00:00Z"))).toBe(false); // 23:00
  });

  it("не начали — советы; бросили — напоминание; почти готово — зовём к заказу", () => {
    expect(draftEmails(book(), now).map((e) => e.kind)).toEqual(["start"]);
    expect(draftEmails(book({ answered: 5 }), now).map((e) => e.kind)).toEqual(["nudge"]);
    expect(draftEmails(book({ answered: ALMOST_READY_ANSWERS }), now).map((e) => e.kind)).toEqual(["almost"]);
  });

  it("напоминание дописать — не чаще раза в 3 дня и не раньше 5 дней тишины", () => {
    expect(draftEmails(book({ answered: 5, remindedAt: new Date(now.getTime() - DAY) }), now)).toEqual([]);
    expect(draftEmails(book({ answered: 5, updatedAt: new Date(now.getTime() - 2 * DAY) }), now)).toEqual([]);
  });

  it("дедлайн к празднику — первым; после заказа — не пишем", () => {
    const soon = book({ answered: 5, occasion: "birthday", occasionDate: "2026-10-15" });
    const emails = draftEmails(soon, now);
    expect(emails[0]).toMatchObject({ kind: "deadline", key: "deadline:b1:2026-10-15", occasion: "birthday" });
    expect(draftEmails({ ...soon, hasOrder: true }, now).some((e) => e.kind === "deadline")).toBe(false);
  });

  it("ручное напоминание из CRM — раз в 3 дня", () => {
    expect(canRemind(null, now)).toBe(true);
    expect(canRemind(new Date(now.getTime() - DAY), now)).toBe(false);
    expect(canRemind(new Date(now.getTime() - 3 * DAY), now)).toBe(true);
  });
});

// ─── сценарии ──────────────────────────────────────────────────────────────

const recipient = (id: string): Recipient => ({ id, email: `${id}@test.local`, name: id, locale: "ru", remindedAt: null });
const order = (id: string, r: Recipient): OrderReminder => ({ recipient: r, orderId: id, number: 1, amount: 1000, contactEmail: r.email });

const templates: EmailTemplates = {
  draft: (e, c) => ({ to: c.recipient.email, subject: e.kind, html: "", note: e.kind }),
  unpaid: (o) => ({ to: o.contactEmail, subject: "unpaid", html: "", note: "unpaid" }),
  review: (o) => ({ to: o.contactEmail, subject: "review", html: "", note: "review" }),
  reminder: (r) => ({ to: r.email, subject: "reminder", html: "", note: "reminder" }),
};

function setup(data: { drafts?: DraftCandidate[]; unpaid?: OrderReminder[]; delivered?: OrderReminder[] }) {
  const sent: { to: string; subject: string }[] = [];
  const notes: string[] = [];
  const claimed = new Set<string>();
  const reminded = new Map<string, Date>();
  const people = new Map<string, Recipient>();
  const mailer: Mailer = { configured: async () => true, send: async (to, subject) => void sent.push({ to, subject }) };
  const source: LifecycleSource = {
    draftCandidates: async () => data.drafts ?? [],
    unpaidOrders: async () => data.unpaid ?? [],
    deliveredOrders: async () => data.delivered ?? [],
    latestDraft: async (userId) => (userId === "u1" ? { bookId: "b1", title: "Книга", answered: 3, total: 50, firstEmpty: 3 } : null),
  };
  const recipients: RecipientRepository = {
    find: async (id) => people.get(id) ?? null,
    markReminded: async (id, at) => void reminded.set(id, at),
    optOut: async (id) => void people.delete(id),
  };
  const journal = { claim: async (userId: string, key: string) => !claimed.has(`${userId}:${key}`) && !!claimed.add(`${userId}:${key}`) };
  const timeline = { emailSent: async (_c: string, _a: string | null, note: string) => void notes.push(note) };
  const clock = { now: () => now };
  return {
    sent,
    notes,
    reminded,
    people,
    lifecycle: new LifecycleService(source, journal, recipients, templates, mailer, timeline, clock),
    reminders: new BookRemindersService(source, recipients, templates, mailer, timeline, clock),
    subscriptions: new SubscriptionsService(recipients, { verify: (u, t) => t === `sig-${u}` }),
  };
}

describe("LifecycleService", () => {
  it("одно письмо клиенту за проход, каждое письмо — один раз", async () => {
    const u = recipient("u1");
    const s = setup({ drafts: [{ recipient: u, book: book() }, { recipient: u, book: book({ bookId: "b2" }) }], unpaid: [order("o1", u)] });
    expect(await s.lifecycle.run()).toBe(1);
    expect(s.sent.map((m) => m.subject)).toEqual(["start"]);
    expect(await s.lifecycle.run()).toBe(1); // вторая книга того же клиента
    expect(await s.lifecycle.run()).toBe(1); // теперь — напоминание об оплате
    expect(await s.lifecycle.run()).toBe(0);
    expect(s.notes).toEqual(["start", "start", "unpaid"]);
  });

  it("ночью не пишет, если не попросили явно", async () => {
    const s = setup({ drafts: [{ recipient: recipient("u1"), book: book() }] });
    const night = new LifecycleService(
      { draftCandidates: async () => [{ recipient: recipient("u1"), book: book() }], unpaidOrders: async () => [], deliveredOrders: async () => [], latestDraft: async () => null },
      { claim: async () => true },
      { find: async () => null, markReminded: async () => {}, optOut: async () => {} },
      templates,
      { configured: async () => true, send: async () => {} },
      { emailSent: async () => {} },
      { now: () => new Date("2026-10-01T18:00:00Z") },
    );
    expect(await night.run()).toBe(0);
    expect(await night.run({ ignoreHours: true })).toBe(1);
    expect(s.sent).toEqual([]);
  });

  it("напоминание дописать отмечает время напоминания", async () => {
    const s = setup({ drafts: [{ recipient: recipient("u1"), book: book({ answered: 5 }) }] });
    await s.lifecycle.run();
    expect(s.reminded.get("u1")).toEqual(now);
  });
});

describe("BookRemindersService", () => {
  it("отказ без клиента, повтор раньше срока и без черновика", async () => {
    const s = setup({});
    expect(await s.reminders.send("u1", "admin")).toEqual({ ok: false, reason: "clientNotFound" });
    s.people.set("u1", recipient("u1"));
    s.people.set("u2", recipient("u2"));
    expect(await s.reminders.send("u2", "admin")).toEqual({ ok: false, reason: "noDraft" });
    expect(await s.reminders.send("u1", "admin")).toEqual({ ok: true });
    s.people.set("u1", { ...recipient("u1"), remindedAt: s.reminded.get("u1")! });
    expect(await s.reminders.send("u1", "admin")).toEqual({ ok: false, reason: "cooldown" });
  });
});

describe("SubscriptionsService", () => {
  it("отписка только по подписанной ссылке", async () => {
    const s = setup({});
    const id = "00000000-0000-4000-8000-000000000001";
    s.people.set(id, recipient(id));
    expect(await s.subscriptions.unsubscribe(id, "forged")).toBe(false);
    expect(await s.subscriptions.unsubscribe(id, `sig-${id}`)).toBe(true);
    expect(s.people.has(id)).toBe(false);
  });
});
