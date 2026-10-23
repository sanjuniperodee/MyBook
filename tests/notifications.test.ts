import { describe, expect, it } from "vitest";
import type { MailResult, Mailer } from "@/shared/application";
import { BANK_READY, BLANK_READY_WORDS } from "@/lib/content/kinds";
import { canRemind, draftEmails, isSendingHour, type DraftProgress } from "@/modules/notifications/domain";
import { emailTemplates } from "@/modules/notifications/infrastructure/templates";
import { BookRemindersService, LifecycleService, SubscriptionsService, type DraftCandidate, type EmailTemplates, type LifecycleSource, type OrderReminder, type Recipient, type RecipientRepository } from "@/modules/notifications/application";
import { storeTimeZoneIs } from "./doubles/time";
import { SmtpMailer, type SmtpConfig } from "@/shared/infrastructure/mail";

const DAY = 86_400_000;
const now = new Date("2026-10-01T08:00:00Z"); // 13:00 в Алматы

// Магазин в Алматы: часы автописем — по его поясу, что бы ни стояло в TZ машины.
storeTimeZoneIs("Asia/Almaty");

const book = (p: Partial<DraftProgress> = {}): DraftProgress => ({
  bookId: "b1",
  title: "Книга",
  occasion: null,
  occasionDate: null,
  updatedAt: new Date(now.getTime() - 10 * DAY),
  theme: "love",
  answered: 0,
  words: 0,
  firstEmpty: "q1",
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
    expect(draftEmails(book({ answered: BANK_READY }), now).map((e) => e.kind)).toEqual(["almost"]);
    // Своя книга — по словам: 30 разделов, но 900 слов — ещё не «почти готова»; 3000 слов в 3 разделах — готова.
    expect(draftEmails(book({ theme: "blank", answered: 30, words: 900 }), now).map((e) => e.kind)).toEqual(["nudge"]);
    expect(draftEmails(book({ theme: "blank", answered: 3, words: BLANK_READY_WORDS }), now).map((e) => e.kind)).toEqual(["almost"]);
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

const recipient = (id: string): Recipient => ({ id, email: `${id}@test.local`, name: id, locale: "ru", remindedAt: null, optOut: false });
const order = (id: string, r: Recipient, theme = "love"): OrderReminder => ({ recipient: r, theme, orderId: id, number: 1, amount: 1000, contactEmail: r.email });

const templates: EmailTemplates = {
  draft: (e, c) => ({ to: c.recipient.email, subject: e.kind, html: "", note: e.kind }),
  unpaid: (o) => ({ to: o.contactEmail, subject: "unpaid", html: "", note: "unpaid" }),
  review: (o) => ({ to: o.contactEmail, subject: "review", html: "", note: "review" }),
  reminder: (r) => ({ to: r.email, subject: "reminder", html: "", note: "reminder" }),
};

function setup(data: { drafts?: DraftCandidate[]; unpaid?: OrderReminder[]; delivered?: OrderReminder[]; mail?: () => MailResult; configured?: boolean }) {
  const sent: { to: string; subject: string }[] = [];
  const notes: string[] = [];
  const claimed = new Set<string>();
  const reminded = new Map<string, Date>();
  const people = new Map<string, Recipient>();
  const mailer: Mailer = {
    configured: async () => data.configured ?? true,
    send: async (to, subject) => {
      const res = data.mail?.() ?? "sent";
      if (res === "sent") sent.push({ to, subject });
      return res;
    },
  };
  const source: LifecycleSource = {
    draftCandidates: async () => data.drafts ?? [],
    unpaidOrders: async () => data.unpaid ?? [],
    reviewDue: async () => data.delivered ?? [],
    latestDraft: async (userId) => (userId === "u1" ? { bookId: "b1", title: "Книга", theme: "love", answered: 3, total: 50, words: 40, firstEmpty: "q3" } : null),
  };
  const recipients: RecipientRepository = {
    find: async (id) => people.get(id) ?? null,
    markReminded: async (id, at) => void reminded.set(id, at),
    optOut: async (id) => void people.delete(id),
  };
  const journal = {
    claim: async (userId: string, key: string) => !claimed.has(`${userId}:${key}`) && !!claimed.add(`${userId}:${key}`),
    release: async (userId: string, key: string) => void claimed.delete(`${userId}:${key}`),
  };
  const timeline = { emailSent: async (_c: string, _a: string | null, note: string) => void notes.push(note) };
  const clock = { now: () => now };
  return {
    sent,
    notes,
    claimed,
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
      { draftCandidates: async () => [{ recipient: recipient("u1"), book: book() }], unpaidOrders: async () => [], reviewDue: async () => [], latestDraft: async () => null },
      { claim: async () => true, release: async () => {} },
      { find: async () => null, markReminded: async () => {}, optOut: async () => {} },
      templates,
      { configured: async () => true, send: async () => "sent" },
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

describe("честный результат отправки писем (automation-d9, automation-d10)", () => {
  it("ошибка SMTP: в ленте и журнале ничего, следующий проход пробует снова", async () => {
    let res: MailResult = "failed";
    const s = setup({ drafts: [{ recipient: recipient("u1"), book: book({ answered: 5 }) }], mail: () => res });
    expect(await s.lifecycle.run()).toBe(0);
    expect(s.notes).toEqual([]);
    expect(s.claimed.size).toBe(0);
    expect(s.reminded.has("u1")).toBe(false);
    res = "sent";
    expect(await s.lifecycle.run()).toBe(1);
    expect(s.notes).toEqual(["nudge"]);
    expect(s.reminded.get("u1")).toEqual(now);
  });

  it("SMTP не настроен — письма не «уходят» и не занимают журнал", async () => {
    const s = setup({ drafts: [{ recipient: recipient("u1"), book: book() }], configured: false });
    expect(await s.lifecycle.run()).toBe(0);
    expect(s.claimed.size).toBe(0);
    expect(s.notes).toEqual([]);
  });

  it("почта-заглушка клиента из WhatsApp: письма не шлём и не отмечаем", async () => {
    const stub = { ...recipient("u1"), email: "77011234567@phone.invalid" };
    const s = setup({ drafts: [{ recipient: stub, book: book() }], unpaid: [order("o1", stub)] });
    expect(await s.lifecycle.run()).toBe(0);
    expect(s.sent).toEqual([]);
    expect(s.claimed.size).toBe(0);
  });

  it("ручное напоминание: заглушка, отписка, выключенная почта и ошибка SMTP — отказ без отметки", async () => {
    let res: MailResult = "unconfigured";
    const s = setup({ mail: () => res });
    s.people.set("u1", { ...recipient("u1"), email: "77011234567@phone.invalid" });
    expect(await s.reminders.send("u1", "admin")).toEqual({ ok: false, reason: "noEmail" });
    s.people.set("u1", { ...recipient("u1"), optOut: true });
    expect(await s.reminders.send("u1", "admin")).toEqual({ ok: false, reason: "optedOut" });
    s.people.set("u1", recipient("u1"));
    expect(await s.reminders.send("u1", "admin")).toEqual({ ok: false, reason: "mailOff" });
    res = "failed";
    expect(await s.reminders.send("u1", "admin")).toEqual({ ok: false, reason: "mailFailed" });
    expect(s.notes).toEqual([]);
    expect(s.reminded.has("u1")).toBe(false);
    res = "sent";
    expect(await s.reminders.send("u1", "admin")).toEqual({ ok: true });
    expect(s.notes).toEqual(["reminder"]);
  });

  it("SmtpMailer говорит, чем кончилась отправка, и ставит Reply-To из настроек", async () => {
    const config: SmtpConfig = { host: "smtp.test", port: 587, secure: false, user: "", password: "", from: "MyBooks <noreply@mybooks.kz>", replyTo: "hello@mybooks.kz" };
    const mails: Record<string, unknown>[] = [];
    let fail = false;
    class FakeSmtp extends SmtpMailer {
      override async transport() {
        const transport = { sendMail: async (o: Record<string, unknown>) => (fail ? Promise.reject(new Error("550")) : void mails.push(o)) };
        return { transport: transport as never, config };
      }
    }
    const mailer = new FakeSmtp(async () => config);
    expect(await mailer.send("77011234567@phone.invalid", "t", "<p>x</p>")).toBe("skipped_stub");
    expect(await mailer.send("a@b.kz", "t", "<p>x</p>")).toBe("sent");
    expect(mails[0]).toMatchObject({ to: "a@b.kz", replyTo: "hello@mybooks.kz", from: config.from });
    fail = true;
    const err = console.error;
    console.error = () => {};
    expect(await mailer.send("a@b.kz", "t", "<p>x</p>")).toBe("failed");
    console.error = err;
    const log = console.log;
    console.log = () => {};
    expect(await new SmtpMailer(async () => null).send("a@b.kz", "t", "<p>x</p>")).toBe("unconfigured");
    console.log = log;
  });

  it("в ручном напоминании есть ссылка отписки", () => {
    const templates = emailTemplates({ url: () => "", thankYouPercent: 15 });
    const mail = templates.reminder(recipient("00000000-0000-4000-8000-000000000001"), { bookId: "b9", title: "Маме", theme: "mom", answered: 7, total: 40, words: 900, firstEmpty: null });
    expect(mail.html).toContain("/unsubscribe");
    expect(mail.html).toContain("Не присылать такие письма");
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

describe("письмо с просьбой об отзыве: ссылка и скидка — от порта ReviewLinks", () => {
  it("кнопка ведёт по ссылке порта, скидка в тексте — из порта", () => {
    const asked: [string, string][] = [];
    const templates = emailTemplates({ url: (orderId, locale) => (asked.push([orderId, locale]), `https://reviews.test/${orderId}?l=${locale}`), thankYouPercent: 15 });
    const mail = templates.review(order("o1", recipient("00000000-0000-4000-8000-000000000001")));
    expect(asked).toEqual([["o1", "ru"]]);
    expect(mail.html).toContain('href="https://reviews.test/o1?l=ru"');
    expect(mail.html).toContain("промокод на 15%");
    expect(mail.note).toBe("Автописьмо: просьба об отзыве по заказу №1");
  });
});

// ─── письма по виду книги ───────────────────────────────────────────────────

describe("автописьма по виду книги", () => {
  const templates = emailTemplates({ url: (orderId, locale) => `https://reviews.test/${orderId}?l=${locale}`, thankYouPercent: 15 });
  const user = (locale: "ru" | "kk" = "ru"): Recipient => ({ ...recipient("00000000-0000-4000-8000-000000000001"), locale });
  // Числа в письмах с разделителем разрядов (неразрывный пробел) — в проверках приводим к обычному пробелу.
  const plain = <T extends { html: string }>(m: T): T => ({ ...m, html: m.html.replace(/\s/g, " ") });
  const draft = (email: ReturnType<typeof draftEmails>[number], b: Partial<DraftProgress>, locale: "ru" | "kk" = "ru") => plain(templates.draft(email, { recipient: user(locale), book: book(b) }));

  it("ссылка ведёт на первый пустой раздел по id, а у книги без разделов — в корень редактора", () => {
    const start = { kind: "start", key: "start:b1" } as const;
    expect(draft(start, { firstEmpty: "0f3e2c1a-0000-4000-8000-000000000009" }).html).toContain("/books/b1/questions?s=0f3e2c1a-0000-4000-8000-000000000009");
    const empty = draft(start, { theme: "blank", firstEmpty: null }).html;
    expect(empty).toMatch(/\/books\/b1\/questions"/);
    expect(empty).not.toContain("?s=");
    expect(empty).not.toContain("?q=");
  });

  it("советы «как начать» — свои у автобиографии и своей книги, на обоих языках", () => {
    const start = { kind: "start", key: "start:b1" } as const;
    const ru = (theme: string) => draft(start, { theme }).html;
    expect(ru("mom")).toContain("Как подруге за чаем");
    expect(ru("autobiography")).toContain("Как рассказали бы внукам");
    expect(ru("autobiography")).toContain("с ваших слов");
    expect(ru("blank")).toContain("С любого раздела");
    expect(ru("blank")).toContain("Написать первый раздел");
    expect(draft(start, { theme: "autobiography" }, "kk").html).toContain("Немерелеріңізге айтып бергендей");
    expect(draft(start, { theme: "blank" }, "kk").html).toContain("Бірінші бөлімді жазу");
  });

  it("у своей книги прогресс в письмах — в словах, у остальных — в ответах", () => {
    const almost = { kind: "almost", key: "almost:b1" } as const;
    const nudge = { kind: "nudge", key: "nudge:b1" } as const;
    const own = draft(almost, { theme: "blank", answered: 4, words: 3120 });
    expect(own.html).toContain("3 120 слов");
    expect(own.html).not.toContain("ответов");
    expect(own.note).toBe("Автописьмо: книга почти готова (3120 слов)");
    expect(draft(almost, { theme: "autobiography", answered: 27 }).html).toContain("27 ответов");
    expect(draft(nudge, { theme: "blank", answered: 2, words: 450 }).html).toContain("450 слов");
    expect(draft(nudge, { theme: "blank", answered: 2, words: 450 }, "kk").html).toContain("450 сөз");
    expect(draft(nudge, { theme: "dad", answered: 8 }).note).toContain("8 ответов");
  });

  it("письмо о дедлайне: готовность и подпись «коротко» — по виду книги", () => {
    const deadline = { kind: "deadline", key: "deadline:b1:2026-10-15", occasion: "birthday", orderBy: new Date("2026-10-05T00:00:00Z"), daysToTarget: 14, premiumOnly: false } as const;
    expect(draft(deadline, { theme: "blank", answered: 9, words: 1400 }).html).toContain("1 400 слов");
    expect(draft(deadline, { theme: "blank", answered: 9, words: 400 }).html).toContain("тысячи слов");
    // У подарка 9 ответов — ещё «коротко», 10 — уже можно смотреть макет.
    expect(draft(deadline, { theme: "love", answered: 9 }).html).toContain("15–20 коротких ответов");
    expect(draft(deadline, { theme: "love", answered: 10 }).html).toContain("10 ответов");
  });

  it("письмо с просьбой об отзыве: подарок — про вручение, автобиография и своя книга — без «подарка»", () => {
    const mail = (theme: string, locale: "ru" | "kk" = "ru") => plain(templates.review(order("o1", user(locale), theme))).html;
    expect(mail("mom")).toContain("вручение");
    expect(mail("autobiography")).not.toMatch(/подарок|вручени/);
    expect(mail("autobiography")).toContain("что сказали близкие");
    expect(mail("blank")).not.toMatch(/подарок|вручени/);
    expect(mail("blank")).toContain("как вам результат");
    expect(mail("autobiography", "kk")).toContain("Жақындарыңыз оқығанда");
    expect(mail("blank", "kk")).not.toContain("Сыйлау қалай");
  });

  it("ручное напоминание из CRM: своя книга — слова, ссылка по id", () => {
    const own = plain(templates.reminder(user(), { bookId: "b9", title: "Записки", theme: "blank", answered: 2, total: 3, words: 640, firstEmpty: "sec-3" }));
    expect(own.html).toContain("640 слов");
    expect(own.html).toContain("/books/b9/questions?s=sec-3");
    expect(own.note).toContain("640 слов");
    const gift = templates.reminder(user(), { bookId: "b9", title: "Маме", theme: "mom", answered: 7, total: 40, words: 900, firstEmpty: null });
    expect(gift.html).toContain("7 ответов из 40");
    expect(gift.note).toContain("7/40");
  });
});
