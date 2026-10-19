import { describe, expect, it } from "vitest";
import { DealInvoice, type AccessStatus } from "@/modules/ordering/domain";
import { normalizePhone } from "@/shared/domain/phone";
import { ACCESS_LEASE_MS, InvoiceAccess, isUnusedAccount, prepaidStage, type AccessAccount, type AccessConversation, type AccessDeal, type AccessStage, type InvoiceAccessPorts } from "@/server/invoice-access";

/**
 * После оплаты счёта из чата (docs/features/chat-invoices.md, 4.1–4.5): чей аккаунт, привязка, что уходит клиенту,
 * один доступ на сделку, ошибки доставки, повторы событий и проходов, выбор аккаунта менеджером.
 */

const T0 = new Date("2026-10-17T06:00:00Z");
const PHONE = "77011234567";
const MGR = "m1";
const ISSUER = "m2";

const stages: AccessStage[] = [
  { id: "new", pipelineId: "p", name: "Новая заявка", kind: "open", position: 0, milestone: null },
  { id: "work", pipelineId: "p", name: "Взяли в работу", kind: "open", position: 1, milestone: null },
  { id: "writing", pipelineId: "p", name: "Пишет книгу", kind: "open", position: 2, milestone: "book_started" },
  { id: "won", pipelineId: "p", name: "Заказ оформлен", kind: "won", position: 4, milestone: "order_created" },
  { id: "lost", pipelineId: "p", name: "Отказ", kind: "lost", position: 5, milestone: null },
];

/** Суммы Intl пишет с неразрывным пробелом — в проверках сравниваем с обычным. */
const plain = (t: string) => t.replace(/[\u00a0\u202f]/g, " ");

const clone = (i: DealInvoice) => {
  const { id, ...props } = i.snapshot();
  return DealInvoice.restore(id, { ...props });
};

type InvoicePort = InvoiceAccessPorts["invoices"];

/** Хранилище счетов с теми же правилами, что DealInvoicesService (захват, итог, «ждёт выдачи»). */
class MemInvoices implements InvoicePort {
  rows = new Map<string, DealInvoice>();
  constructor(private readonly now: () => Date) {}
  async byId(id: string) {
    const i = this.rows.get(id);
    return i ? clone(i) : null;
  }
  async listFor(dealId: string) {
    return [...this.rows.values()].filter((i) => i.dealId === dealId).map(clone);
  }
  async accessDue() {
    return [...this.rows.values()].filter((i) => i.status === "paid" && i.access.status === "due").map(clone);
  }
  async accessSent() {
    return [...this.rows.values()].filter((i) => i.status === "paid" && i.access.status === "sent").map(clone);
  }
  async claimAccess(id: string, leaseMs: number) {
    const i = this.rows.get(id);
    return i?.claimAccess(this.now(), leaseMs) ? clone(i) : null;
  }
  async finishAccess(id: string, claimedAt: Date, status: Exclude<AccessStatus, "none" | "due">, userId: string | null, messageId: string | null) {
    return !!this.rows.get(id)?.finishAccess(claimedAt, status, userId, messageId);
  }
  async setAccess(id: string, status: AccessStatus, userId?: string | null) {
    this.rows.get(id)?.setAccess(status, userId);
  }
  async expireOverdue() {
    return [...this.rows.values()].filter((i) => i.expire(this.now())).map(clone);
  }
}

interface World {
  access: InvoiceAccess;
  invoices: MemInvoices;
  deals: Map<string, AccessDeal>;
  accounts: AccessAccount[];
  usage: Map<string, { lastSeenAt: Date | null; books: number; orders: number }>;
  other: AccessAccount[];
  convs: Map<string, AccessConversation>;
  sent: { conv: string; text: string; id: string }[];
  status: Map<string, string>;
  chatNotes: { conv: string; text: string }[];
  notes: { dealId: string; clientId: string | null; text: string }[];
  tasks: { dealId: string; title: string; assigneeId: string; done: boolean }[];
  notified: { to: string[] | "editors"; title: string }[];
  links: { userId: string }[];
  resetMails: string[];
  paymentMails: { clientId: string; amount: number; left: number }[];
  provisioned: { name: string; phone: string; locale: string; channel: string; assigneeId: string | null }[];
  linked: { deal: [string, string][]; money: [string, string, string | null][]; dealChats: [string, string][]; chat: [string, string][] };
  moved: [string, string][];
  calls: { byPhone: number };
  sendFails: { next: number };
  clock: { now: () => Date; tick(ms: number): void };
  paid: Map<string, number>;
  /** Счёт по сделке: оплачен (access_status='due'). */
  pay(input?: Partial<{ id: string; number: number; dealId: string; conversationId: string | null; phone: string | null; amount: number; method: "kaspi" | "cloudpayments" | "manual"; locale: "ru" | "kk"; clientName: string }>): DealInvoice;
}

function world(): World {
  let now = T0.getTime();
  const clock = { now: () => new Date(now), tick: (ms: number) => void (now += ms) };
  const w = {
    invoices: new MemInvoices(clock.now),
    deals: new Map<string, AccessDeal>([["d1", { id: "d1", number: 7, title: "Заявка из WhatsApp: Айгерим", clientId: null, assigneeId: MGR, amount: 30000, stageId: "new" }]]),
    accounts: [] as AccessAccount[],
    usage: new Map(),
    other: [] as AccessAccount[],
    convs: new Map<string, AccessConversation>([["c1", { id: "c1", channel: "whatsapp", chatId: PHONE }]]),
    sent: [] as World["sent"],
    status: new Map<string, string>(),
    chatNotes: [] as World["chatNotes"],
    notes: [] as World["notes"],
    tasks: [] as World["tasks"],
    notified: [] as World["notified"],
    links: [] as World["links"],
    resetMails: [] as string[],
    paymentMails: [] as World["paymentMails"],
    provisioned: [] as World["provisioned"],
    linked: { deal: [], money: [], dealChats: [], chat: [] } as World["linked"],
    moved: [] as [string, string][],
    calls: { byPhone: 0 },
    sendFails: { next: 0 },
    clock,
    paid: new Map<string, number>(),
  };
  let seq = 0;
  const ports: InvoiceAccessPorts = {
    invoices: w.invoices,
    deals: {
      find: async (id) => {
        const d = w.deals.get(id);
        return d ? { ...d } : null;
      },
      paidTotal: async (dealId) => w.paid.get(dealId) ?? 0,
      linkClient: async (dealId, clientId) => {
        w.linked.deal.push([dealId, clientId]);
        w.deals.get(dealId)!.clientId = clientId;
      },
      assignMoney: async (dealId, clientId, from) => void w.linked.money.push([dealId, clientId, from]),
      stages: async () => stages,
      move: async (dealId, stageId) => {
        w.moved.push([dealId, stageId]);
        w.deals.get(dealId)!.stageId = stageId;
      },
    },
    accounts: {
      find: async (id) => w.accounts.find((a) => a.id === id) ?? null,
      byPhone: async (phone) => {
        w.calls.byPhone++;
        return w.accounts.filter((a) => a.role === "user" && normalizePhone(a.phone) === normalizePhone(phone));
      },
      byOtherPhone: async () => w.other,
      usage: async (id) => w.usage.get(id) ?? { lastSeenAt: null, books: 0, orders: 0 },
      provision: async (input) => {
        w.provisioned.push(input);
        if (w.accounts.some((a) => a.email === `${input.phone}@phone.invalid`)) return { existingId: w.accounts.find((a) => a.email === `${input.phone}@phone.invalid`)!.id };
        const a = { id: `new-${++seq}`, role: "user", email: `${input.phone}@phone.invalid`, name: input.name, phone: input.phone };
        w.accounts.push(a);
        return { id: a.id };
      },
      issueAccessLink: async (userId) => {
        w.links.push({ userId });
        const a = w.accounts.find((x) => x.id === userId)!;
        return { token: `TOKEN${w.links.length}abcdefghijklmnop`, login: a.email.endsWith("@phone.invalid") ? normalizePhone(a.phone) : a.email };
      },
      mailPasswordReset: async (email) => void w.resetMails.push(email),
      isAdminEmail: (email) => email === "owner@mybook.kz",
    },
    chats: {
      conversation: async (id) => w.convs.get(id) ?? null,
      send: async (conv, text) => {
        const id = `msg${++seq}`;
        const failed = w.sendFails.next > 0;
        if (failed) w.sendFails.next--;
        w.sent.push({ conv, text: plain(text), id });
        w.status.set(id, failed ? "error" : "sent");
        return { id, status: failed ? "error" : "sent" };
      },
      note: async (conv, text) => void w.chatNotes.push({ conv, text: plain(text) }),
      hasNote: async (conv, text) => w.chatNotes.some((n) => n.conv === conv && n.text === plain(text)),
      messageStatus: async (id) => w.status.get(id) ?? null,
      linkClient: async (conv, clientId) => void w.linked.chat.push([conv, clientId]),
      linkDealClient: async (dealId, clientId) => void w.linked.dealChats.push([dealId, clientId]),
    },
    crm: {
      noteOnce: async (n) => {
        if (w.notes.some((x) => x.dealId === n.dealId && x.text === plain(n.text))) return false;
        w.notes.push({ ...n, text: plain(n.text) });
        return true;
      },
      taskOnce: async (t) => {
        if (w.tasks.some((x) => x.dealId === t.dealId && x.title === plain(t.title) && !x.done)) return false;
        w.tasks.push({ dealId: t.dealId, title: plain(t.title), assigneeId: t.assigneeId, done: false });
        return true;
      },
      closeTasks: async ({ dealId, prefix, keepTitle }) => {
        let n = 0;
        for (const t of w.tasks) {
          if (t.dealId !== dealId || t.done || !t.title.startsWith(prefix) || t.title === (keepTitle && plain(keepTitle))) continue;
          t.done = true;
          n++;
        }
        return n;
      },
      notify: async (to, n) => void w.notified.push({ to, title: plain(n.title) }),
      notifyEditors: async (n) => void w.notified.push({ to: "editors", title: plain(n.title) }),
    },
    mail: { paymentReceived: async (input) => void w.paymentMails.push(input) },
    links: { login: (l) => `https://mb.kz${l === "kk" ? "/kk" : ""}/login`, reset: (token, l) => `https://mb.kz${l === "kk" ? "/kk" : ""}/reset/${token}` },
    clock,
    logger: { error: () => {} },
  };
  let number = 11;
  const pay: World["pay"] = (input = {}) => {
    const id = input.id ?? `inv-${++number}`;
    const invoice = DealInvoice.issue(
      id,
      {
        number: input.number ?? number,
        token: `tok-${id}`,
        dealId: input.dealId ?? "d1",
        conversationId: input.conversationId === undefined ? "c1" : input.conversationId,
        phone: input.phone === undefined ? PHONE : input.phone,
        clientName: input.clientName ?? "Айгерим Сапарова",
        locale: input.locale ?? "ru",
        channel: "instagram",
        plan: "hardcover",
        agreedTotal: 30000,
        amount: input.amount ?? 15000,
        purpose: "prepayment",
        issuedById: ISSUER,
        issueKey: null,
      },
      clock.now(),
    );
    invoice.markPaid(input.method ?? "kaspi", input.method === "manual" ? null : `op-${id}`, clock.now());
    invoice.pullEvents();
    w.invoices.rows.set(id, invoice);
    const dealId = input.dealId ?? "d1";
    w.paid.set(dealId, (w.paid.get(dealId) ?? 0) + (input.amount ?? 15000));
    return invoice;
  };
  return { ...w, access: new InvoiceAccess(ports), pay };
}

const client = (p: Partial<AccessAccount> & { id: string }): AccessAccount => ({ role: "user", email: `${p.id}@mail.kz`, name: "Айгерим", phone: PHONE, ...p });
const accessOf = (w: World, id: string) => w.invoices.rows.get(id)!.access;

describe("правила", () => {
  it("этап «предоплата получена»: свой этап с «предоплат» в названии, иначе «Взяли в работу»; только вперёд", () => {
    expect(prepaidStage(stages, "new")?.id).toBe("work");
    expect(prepaidStage(stages, "work")).toBeNull();
    expect(prepaidStage(stages, "writing")).toBeNull(); // сделка дальше — назад не двигаем
    expect(prepaidStage(stages, "won")).toBeNull();
    const own = [...stages, { id: "pre", pipelineId: "p", name: "Предоплата получена", kind: "open", position: 1.5, milestone: null }];
    expect(prepaidStage(own, "work")?.id).toBe("pre");
  });

  it("счёт: захват выдачи — только оплаченный «ждёт выдачи» и с таймаутом; итог пишет только свой захват; новая просьба освобождает", () => {
    const w = world();
    const inv = w.pay();
    const open = DealInvoice.issue("x", { ...inv.snapshot(), issueKey: null }, T0);
    expect(open.claimAccess(T0, ACCESS_LEASE_MS)).toBe(false); // не оплачен
    expect(inv.claimAccess(T0, ACCESS_LEASE_MS)).toBe(true);
    expect(inv.claimAccess(new Date(T0.getTime() + 60_000), ACCESS_LEASE_MS)).toBe(false); // занят
    const later = new Date(T0.getTime() + ACCESS_LEASE_MS + 1);
    expect(inv.claimAccess(later, ACCESS_LEASE_MS)).toBe(true); // прежний проход упал
    expect(inv.finishAccess(T0, "sent", "u1", "m1")).toBe(false); // не наш захват
    inv.setAccess("due"); // менеджер попросил выдать заново, пока шла отправка
    expect(inv.finishAccess(later, "sent", "u1", "m1")).toBe(false);
    expect(inv.access).toMatchObject({ status: "due", attemptedAt: null });
    expect(inv.claimAccess(later, ACCESS_LEASE_MS)).toBe(true);
    expect(inv.finishAccess(later, "sent", "u1", "m1")).toBe(true);
    expect(inv.access).toMatchObject({ status: "sent", userId: "u1", messageId: "m1" });
    expect(inv.claimAccess(later, ACCESS_LEASE_MS)).toBe(false); // уже выдан
  });

  it("аккаунт не использован: не заходил, нет книг и заказов", () => {
    expect(isUnusedAccount({ lastSeenAt: null, books: 0, orders: 0 })).toBe(true);
    expect(isUnusedAccount({ lastSeenAt: T0, books: 0, orders: 0 })).toBe(false);
    expect(isUnusedAccount({ lastSeenAt: null, books: 1, orders: 0 })).toBe(false);
    expect(isUnusedAccount({ lastSeenAt: null, books: 0, orders: 1 })).toBe(false);
  });
});

describe("клиент по номеру WhatsApp-чата (4.1)", () => {
  it("ровно одно совпадение, аккаунт новый: привязка сделки, чата, денег; этап; условия; остаток; ссылка «задайте пароль»", async () => {
    const w = world();
    w.accounts.push(client({ id: "u1" }));
    const inv = w.pay();
    expect(await w.access.process(inv.id)).toBe("sent");
    expect(w.provisioned).toEqual([]); // пароль и аккаунт не трогаем
    expect(w.deals.get("d1")!.clientId).toBe("u1");
    expect(w.linked).toEqual({ deal: [["d1", "u1"]], money: [["d1", "u1", null]], dealChats: [["d1", "u1"]], chat: [["c1", "u1"]] });
    expect(w.moved).toEqual([["d1", "work"]]);
    expect(w.notes.map((n) => n.text).join("\n")).toContain("договорённость 30 000 ₸ за книгу, оплачено всего 15 000 ₸, остаток 15 000 ₸");
    expect(w.tasks).toEqual([expect.objectContaining({ assigneeId: MGR, title: expect.stringContaining("Получить остаток 15 000 ₸") })]);
    expect(w.links).toEqual([{ userId: "u1" }]);
    expect(w.sent).toHaveLength(1);
    expect(w.sent[0].text).toContain("Задайте пароль и войдите: https://mb.kz/reset/TOKEN1");
    expect(w.sent[0].text).toContain("Логин: номер этого WhatsApp");
    expect(w.sent[0].text).toContain("72 часа");
    // в переписке (её видят и менеджеры без доступа к номерам) — ни номера, ни почты
    expect(w.sent[0].text).not.toMatch(/7011234567|701 123|u1@mail\.kz/);
    expect(accessOf(w, inv.id)).toMatchObject({ status: "sent", userId: "u1", messageId: w.sent[0].id });
    // во внутренних записях ссылки нет — только «ссылка отправлена»
    const internal = [...w.notes.map((n) => n.text), ...w.tasks.map((t) => t.title), ...w.chatNotes.map((n) => n.text)].join("\n");
    expect(internal).not.toContain("/reset/");
    expect(internal).toContain("ссылка «задайте пароль»");
    // письмо об онлайн-оплате — только на настоящую почту
    expect(w.paymentMails).toEqual([{ clientId: "u1", dealNumber: 7, amount: 15000, left: 15000 }]);
  });

  it("аккаунтом пользуются: «войдите как обычно» без ссылки сброса в чате; ссылка сброса — на почту, в чате адрес с маской", async () => {
    const w = world();
    w.accounts.push(client({ id: "u1", email: "aliya@gmail.com" }));
    w.usage.set("u1", { lastSeenAt: T0, books: 1, orders: 0 });
    const inv = w.pay();
    await w.access.process(inv.id);
    expect(w.links).toEqual([]);
    expect(w.resetMails).toEqual(["aliya@gmail.com"]);
    expect(w.sent[0].text).not.toContain("/reset/");
    expect(w.sent[0].text).toContain("Войдите в личный кабинет как обычно: https://mb.kz/login");
    expect(w.sent[0].text).toContain("al•••@gmail.com");
    expect(w.sent[0].text).not.toContain("aliya@gmail.com");
  });

  it("аккаунтом пользуются, почты нет: логин — номер этого чата (без цифр в тексте), совет написать в чат", async () => {
    const w = world();
    w.accounts.push(client({ id: "u1", email: `${PHONE}@phone.invalid` }));
    w.usage.set("u1", { lastSeenAt: null, books: 0, orders: 2 });
    await w.access.process(w.pay().id);
    expect(w.resetMails).toEqual([]);
    expect(w.sent[0].text).toContain("Логин: номер этого WhatsApp");
    expect(w.sent[0].text).toContain("напишите нам здесь");
    expect(w.paymentMails).toEqual([]); // почты нет — письма нет
  });

  it("нет совпадения и у сделки нет клиента: аккаунт заводится (имя, язык, канал из счёта; ответственный сделки) и получает ссылку", async () => {
    const w = world();
    const inv = w.pay({ locale: "kk" });
    expect(await w.access.process(inv.id)).toBe("sent");
    expect(w.provisioned).toEqual([{ name: "Айгерим Сапарова", phone: PHONE, locale: "kk", channel: "instagram", assigneeId: MGR }]);
    expect(w.deals.get("d1")!.clientId).toBe("new-1");
    expect(w.links).toEqual([{ userId: "new-1" }]);
    // на языке счёта, логин — телефон
    expect(w.sent[0].text).toContain("Құпиясөз орнатып, кіріңіз: https://mb.kz/kk/reset/TOKEN1");
    expect(w.sent[0].text).toContain("Логин: осы WhatsApp нөмірі");
  });

  it("имени в счёте нет (контакт заявки — номер): аккаунт по номеру, приветствие без «имени» из цифр", async () => {
    const w = world();
    await w.access.process(w.pay({ clientName: "…4567" }).id);
    expect(w.provisioned[0].name).toBe("+7 701 123 45 67");
    expect(w.sent[0].text.startsWith("Здравствуйте! ")).toBe(true);
  });

  const managerCase = async (w: World, inv: DealInvoice) => {
    expect(await w.access.process(inv.id)).toBe("needs_manager");
    expect(w.linked.deal).toEqual([]);
    expect(w.links).toEqual([]);
    expect(w.provisioned).toEqual([]);
    expect(accessOf(w, inv.id)).toMatchObject({ status: "needs_manager", userId: null });
    const task = w.tasks.find((t) => t.title.startsWith("Подтвердите, чей это аккаунт"));
    expect(task?.assigneeId).toBe(MGR);
    expect(task?.title).not.toContain(PHONE);
    return task!.title;
  };

  it("несколько совпадений: никого не привязываем, логин не раскрываем, менеджеру — кандидаты без полных номеров", async () => {
    const w = world();
    w.accounts.push(client({ id: "u1", name: "Айгерим", email: "aliya@gmail.com" }), client({ id: "u2", name: "Арман" }));
    const title = await managerCase(w, w.pay());
    expect(title).toContain("несколько аккаунтов");
    expect(title).toContain("Айгерим, …4567, al•••@gmail.com");
    expect(title).toContain("Арман, …4567");
    // клиенту — нейтрально, без логина
    expect(w.sent).toHaveLength(1);
    expect(w.sent[0].text).toContain("Менеджер пришлёт вам доступ");
    expect(w.sent[0].text).not.toMatch(/Логин|reset|mail\.kz/);
  });

  it("сделка привязана к другому аккаунту: никого не привязываем", async () => {
    const w = world();
    w.accounts.push(client({ id: "u1" }), client({ id: "x9", name: "Другой", phone: "77770000000" }));
    w.deals.get("d1")!.clientId = "x9";
    expect(await managerCase(w, w.pay())).toContain("сделка привязана к другому клиенту");
    // и без совпадения по номеру — тоже менеджер, второй аккаунт не заводим
    const w2 = world();
    w2.accounts.push(client({ id: "x9", phone: "77770000000" }));
    w2.deals.get("d1")!.clientId = "x9";
    await managerCase(w2, w2.pay());
  });

  it("номера нет / чат не WhatsApp / номер чата другой — менеджер", async () => {
    const w = world();
    expect(await managerCase(w, w.pay({ phone: null }))).toContain("нет номера WhatsApp");
    const w2 = world();
    w2.convs.set("c1", { id: "c1", channel: "instagram", chatId: "aigerim.s" });
    expect(await managerCase(w2, w2.pay())).toContain("не из WhatsApp");
    const w3 = world();
    w3.convs.set("c1", { id: "c1", channel: "whatsapp", chatId: "77770000000" });
    await managerCase(w3, w3.pay());
  });

  it("номер только доп. телефоном или в заказе — второй аккаунт не заводим, решает менеджер", async () => {
    const w = world();
    w.other.push(client({ id: "u5", name: "Сауле", phone: "77770000000" }));
    expect(await managerCase(w, w.pay())).toContain("только доп. телефоном или в заказе");
  });

  it("сотрудник и адрес из ADMIN_EMAILS — никогда: совпадение по номеру уходит менеджеру", async () => {
    const w = world();
    w.accounts.push(client({ id: "own", email: "owner@mybook.kz" }));
    expect(await managerCase(w, w.pay())).toContain("не клиентский");
  });

  it("логин с номером уже занят (почта-заглушка у аккаунта с другим телефоном) — менеджер", async () => {
    const w = world();
    w.accounts.push(client({ id: "u7", email: `${PHONE}@phone.invalid`, phone: "77770000000" }));
    expect(await w.access.process(w.pay().id)).toBe("needs_manager");
    expect(w.tasks[0].title).toContain("логин с номером чата уже занят");
  });
});

describe("повторы и один доступ на сделку (4.2, 4.5)", () => {
  it("повтор прохода и события: ничего не задваивается; захват не даёт взять счёт дважды", async () => {
    const w = world();
    const inv = w.pay();
    const claimed = await w.invoices.claimAccess(inv.id, ACCESS_LEASE_MS);
    expect(claimed).not.toBeNull();
    expect(await w.access.process(inv.id)).toBeNull(); // занят другим проходом
    w.clock.tick(ACCESS_LEASE_MS + 1); // тот упал — захват истёк
    expect(await w.access.process(inv.id)).toBe("sent");
    const snapshot = { notes: w.notes.length, tasks: w.tasks.length, sent: w.sent.length, links: w.links.length, accounts: w.accounts.length };
    await w.access.run();
    await w.access.run();
    expect({ notes: w.notes.length, tasks: w.tasks.length, sent: w.sent.length, links: w.links.length, accounts: w.accounts.length }).toEqual(snapshot);
  });

  it("сбой после отправки (итог не записан): повтор находит заведённый аккаунт, заметки и задачи не дублируются", async () => {
    const w = world();
    const inv = w.pay();
    const finish = w.invoices.finishAccess.bind(w.invoices);
    let crash = true;
    w.invoices.finishAccess = async (...a) => {
      if (crash) {
        crash = false;
        throw new Error("db down");
      }
      return finish(...a);
    };
    expect(await w.access.process(inv.id)).toBeNull();
    w.clock.tick(ACCESS_LEASE_MS + 1);
    expect(await w.access.process(inv.id)).toBe("sent");
    expect(w.accounts).toHaveLength(1);
    expect(w.provisioned).toHaveLength(1);
    expect(w.tasks.filter((t) => t.title.includes("остаток"))).toHaveLength(1);
    expect(new Set(w.notes.map((n) => n.text)).size).toBe(w.notes.length);
    expect(accessOf(w, inv.id).status).toBe("sent");
  });

  it("доступ — один раз на клиента и сделку: следующий оплаченный счёт — коротко «оплата получена», без новой ссылки (skipped)", async () => {
    const w = world();
    await w.access.process(w.pay().id);
    const second = w.pay({ amount: 15000 });
    expect(await w.access.process(second.id)).toBe("skipped");
    expect(accessOf(w, second.id)).toMatchObject({ status: "skipped", userId: "new-1" });
    expect(w.links).toHaveLength(1);
    expect(w.sent[1].text).toContain("Айгерим! Оплата по счёту P13 получена — 15 000 ₸. Спасибо! Личный кабинет: https://mb.kz/login");
    expect(w.sent[1].text).not.toContain("/reset/");
    // остаток оплачен — новой задачи «получить остаток» нет
    expect(w.tasks.filter((t) => t.title.includes("остаток"))).toHaveLength(1);
    expect(w.notes.some((n) => n.text.includes("договорённость оплачена полностью"))).toBe(true);
  });

  it("ручной путь (перевод с чеком): та же привязка и доступ, письма об оплате нет", async () => {
    const w = world();
    const inv = w.pay({ method: "manual" });
    expect(await w.access.process(inv.id)).toBe("sent");
    expect(w.deals.get("d1")!.clientId).toBe("new-1");
    expect(w.linked.money).toEqual([["d1", "new-1", null]]);
    expect(w.paymentMails).toEqual([]);
  });
});

describe("ошибка доставки (4.5)", () => {
  it("не ушло: одна заметка в чате и одна задача, новых ссылок нет; при входящем — повтор один раз", async () => {
    const w = world();
    w.sendFails.next = 1;
    const inv = w.pay();
    expect(await w.access.process(inv.id)).toBe("failed");
    expect(w.links).toHaveLength(1);
    expect(w.chatNotes).toHaveLength(1);
    expect(w.chatNotes[0].text).toContain("не ушёл клиенту");
    expect(w.tasks.filter((t) => t.title.includes("не ушёл"))).toHaveLength(1);
    // проходы и проверка доставки сами ничего не шлют и токенов не выпускают
    await w.access.run();
    await w.access.run();
    expect(w.links).toHaveLength(1);
    expect(w.sent).toHaveLength(1);
    // клиент написал — повтор (одна новая ссылка вместо неушедшей)
    await w.access.onIncoming({ conversationId: "c1", dealId: "d1" });
    expect(accessOf(w, inv.id).status).toBe("due");
    w.sendFails.next = 1;
    await w.access.run();
    expect(accessOf(w, inv.id).status).toBe("failed");
    expect(w.links).toHaveLength(2);
    expect(w.tasks.filter((t) => t.title.includes("не ушёл"))).toHaveLength(1);
    expect(w.chatNotes.filter((n) => n.text.includes("не ушёл"))).toHaveLength(1);
    // второй раз — только менеджер
    await w.access.onIncoming({ conversationId: "c1", dealId: "d1" });
    expect(accessOf(w, inv.id).status).toBe("failed");
    await w.access.run();
    expect(w.links).toHaveLength(2);
  });

  it("позже статус доставки «ошибка»: «не ушёл», заметка и задача; «доставлено» — «доставлен»", async () => {
    const w = world();
    const a = w.pay();
    await w.access.process(a.id);
    w.status.set(accessOf(w, a.id).messageId!, "error");
    expect(await w.access.checkDelivery()).toBe(1);
    expect(accessOf(w, a.id).status).toBe("failed");
    expect(w.chatNotes).toHaveLength(1);
    expect(w.tasks.filter((t) => t.title.includes("не ушёл"))).toHaveLength(1);
    await w.access.checkDelivery();
    expect(w.chatNotes).toHaveLength(1);

    const w2 = world();
    const b = w2.pay();
    await w2.access.process(b.id);
    w2.status.set(accessOf(w2, b.id).messageId!, "delivered");
    await w2.access.checkDelivery();
    expect(accessOf(w2, b.id).status).toBe("delivered");
  });
});

describe("аккаунт выбрал менеджер (setAccess due + userId)", () => {
  it("выдаётся выбранному аккаунту без поиска по телефону; сделка привязывается к нему", async () => {
    const w = world();
    w.accounts.push(client({ id: "u1", name: "Айгерим" }), client({ id: "u2", name: "Арман" }));
    const inv = w.pay();
    expect(await w.access.process(inv.id)).toBe("needs_manager");
    const lookups = w.calls.byPhone;
    await w.invoices.setAccess(inv.id, "due", "u2");
    expect(await w.access.process(inv.id)).toBe("sent");
    expect(w.calls.byPhone).toBe(lookups);
    expect(w.deals.get("d1")!.clientId).toBe("u2");
    expect(accessOf(w, inv.id)).toMatchObject({ status: "sent", userId: "u2" });
    expect(w.links).toEqual([{ userId: "u2" }]);
    // выбран не по номеру — логин с маской: клиент свою почту узнает, менеджер её не видит
    expect(w.sent[1].text).toContain("Логин: u2•••@mail.kz");
    // нейтральное сообщение было одно, теперь — доступ
    expect(w.sent.map((m) => m.text.includes("/reset/"))).toEqual([false, true]);
  });

  it("выбран сотрудник или служебный адрес — не выдаём, снова менеджер", async () => {
    const w = world();
    w.accounts.push(client({ id: "s1", role: "admin" }));
    const inv = w.pay();
    await w.invoices.setAccess(inv.id, "due", "s1");
    expect(await w.access.process(inv.id)).toBe("needs_manager");
    expect(w.links).toEqual([]);
    expect(accessOf(w, inv.id).userId).toBeNull();
  });

  it("«Отправить доступ ещё раз» тому же клиенту: новая ссылка, привязка и задачи не повторяются", async () => {
    const w = world();
    const inv = w.pay();
    await w.access.process(inv.id);
    const before = { notes: w.notes.length, tasks: w.tasks.length };
    await w.invoices.setAccess(inv.id, "due");
    expect(await w.access.process(inv.id)).toBe("sent");
    expect(w.links).toHaveLength(2);
    expect(w.linked.deal).toHaveLength(1);
    expect(w.tasks).toHaveLength(before.tasks);
  });
});

describe("подписчики счёта: заметки и уведомления (4.6)", () => {
  const paid = { invoiceId: "inv-1", number: 12, dealId: "d1", amount: 15000, method: "kaspi" as const, ref: "8812", conversationId: "c1", phone: PHONE, clientName: "Айгерим", locale: "ru" as const, channel: "instagram", issuedById: ISSUER };

  it("онлайн: запись «Оплачен счёт P12 — 15 000 ₸ (Kaspi, операция 8812)» одна при повторе; ручной путь — без записи", async () => {
    const w = world();
    await w.access.paidNote(paid);
    await w.access.paidNote(paid);
    expect(w.notes.map((n) => n.text)).toEqual(["Оплачен счёт P12 — 15 000 ₸ (Kaspi, операция 8812)"]);
    await w.access.paidNote({ ...paid, method: "manual", ref: null });
    expect(w.notes).toHaveLength(1);
  });

  it("уведомление: ответственному, иначе выставившему, иначе всем с deals.edit", async () => {
    const w = world();
    await w.access.paidNotify(paid);
    w.deals.get("d1")!.assigneeId = null;
    await w.access.paidNotify(paid);
    await w.access.paidNotify({ ...paid, issuedById: null });
    expect(w.notified.map((n) => n.to)).toEqual([[MGR], [ISSUER], "editors"]);
  });

  it("лишние деньги: повторная оплата — возврат; по закрытому счёту или после заказа — возврат или зачёт; без дублей", async () => {
    const w = world();
    const extra = { invoiceId: "inv-1", number: 12, dealId: "d1", amount: 15000, method: "kaspi" as const, ref: "9", paid: 15000, recorded: true, reason: "overpaid" as const };
    await w.access.extraMoney(extra);
    await w.access.extraMoney(extra);
    await w.access.extraMoney({ ...extra, ref: "10", recorded: false, reason: "order" });
    expect(w.tasks.map((t) => t.title)).toEqual(["Повторная оплата по счёту P12: 15 000 ₸ (Kaspi, операция 9) — нужен возврат", "Оплата 15 000 ₸ пришла по закрытому счёту P12 (Kaspi, операция 10) — нужен возврат или зачёт в заказ"]);
    expect(w.notes).toHaveLength(2);
    expect(w.notified).toHaveLength(2);
  });

  it("клиент сообщил о переводе: задача ответственному «проверьте поступление»", async () => {
    const w = world();
    await w.access.claimed({ invoiceId: "inv-1", number: 12, dealId: "d1", amount: 15000 });
    expect(w.tasks).toEqual([expect.objectContaining({ assigneeId: MGR, title: "Клиент сообщил, что оплатил переводом по счёту P12 (15 000 ₸) — проверьте поступление" })]);
  });

  it("истёк неоплаченным: «истёк» и задача связаться с клиентом — одна", async () => {
    const w = world();
    const invoice = DealInvoice.issue("inv-x", { number: 20, token: "t", dealId: "d1", conversationId: "c1", phone: PHONE, clientName: "А", locale: "ru", channel: "instagram", plan: "hardcover", agreedTotal: 30000, amount: 15000, purpose: "prepayment", issuedById: ISSUER, issueKey: null }, w.clock.now());
    w.invoices.rows.set("inv-x", invoice);
    expect(await w.access.expire()).toBe(0);
    w.clock.tick(8 * 86_400_000);
    expect(await w.access.expire()).toBe(1);
    expect(await w.access.expire()).toBe(0);
    expect(w.tasks.map((t) => t.title)).toEqual(["Счёт P20 истёк неоплаченным — свяжитесь с клиентом"]);
  });
});
