import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { formatPrice } from "@/config/site";
import { InvoiceForm } from "@/components/admin/invoices/InvoiceDialog";
import { InvoicesBlock } from "@/components/admin/invoices/InvoicesBlock";
import { PaymentsPanel } from "@/app/admin/deals/[id]/PaymentsPanel";
import type { InvoiceFormInfo } from "@/app/admin/invoices/actions";
import {
  accessLabels,
  amountOptions,
  choiceNeeded,
  discountProblem,
  guardIds,
  invoiceActions,
  invoicePreview,
  invoiceStatus,
  newIssueKey,
  overpaidPayments,
  pickAmount,
  type InvoicePerms,
  type InvoiceView,
} from "@/components/admin/invoices/model";

// Интерфейс счетов в CRM (зона C): чистые правила формы и блока «Счета» и разметка компонентов (renderToStaticMarkup).
// Серверные действия и роутер подменены: здесь проверяется, что видит менеджер, а не сервер.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
vi.mock("@/app/admin/invoices/actions", () => ({
  invoiceFormInfoAction: vi.fn(),
  issueInvoiceAction: vi.fn(),
  cancelInvoiceAction: vi.fn(),
  resendInvoiceAction: vi.fn(),
  resendInvoiceAccessAction: vi.fn(),
  invoiceAccountsAction: vi.fn(),
}));
vi.mock("@/app/admin/deals/actions", () => ({ setDealAgreedPlanAction: vi.fn() }));

const price = formatPrice;
const html = (el: React.ReactElement) => renderToStaticMarkup(el);
/** Кнопка с этим текстом выключена (в кнопке перед текстом может быть иконка). */
const disabledButton = (out: string, text: string) => out.split("<button").some((b) => b.includes(text) && b.slice(0, b.indexOf(">")).includes('disabled=""'));

const info = (over: Partial<InvoiceFormInfo> = {}): InvoiceFormInfo => ({
  dealId: "d1",
  dealNumber: 7,
  plan: "hardcover",
  agreedTotal: 30_000,
  paid: 0,
  hasOrder: false,
  orderId: null,
  closed: false,
  open: null,
  clientName: "Айгерим Сейткали",
  locale: "ru",
  channel: "instagram",
  chat: "WhatsApp",
  plans: [
    { id: "digital", label: "Электронная версия", price: 9_900 },
    { id: "hardcover", label: "Твёрдая обложка", price: 30_000 },
  ],
  methods: { kaspi: true, card: false, transfer: true },
  kaspiPhoneMasked: null,
  maxDiscountPercent: 10,
  preview: { until: { ru: "24 октября", kk: "24 қазан" }, link: { ru: "https://mybook.kz/pay/…", kk: "https://mybook.kz/kk/pay/…" } },
  ...over,
});

const view = (over: Partial<InvoiceView> = {}): InvoiceView => ({
  id: "i1",
  label: "P12",
  amount: 15_000,
  purpose: "prepayment",
  status: "pending_payment",
  overdue: false,
  expiresLabel: "24 октября 2026 г., 10:00",
  paidLabel: null,
  paidMethod: null,
  paidRef: null,
  closedReason: null,
  claimedLabel: null,
  access: "none",
  hasChat: true,
  link: "https://mybook.kz/pay/tok",
  ...over,
});

const all: InvoicePerms = { edit: true, send: true, access: true, pay: true };
const none: InvoicePerms = { edit: false, send: false, access: false, pay: false };

describe("форма счёта: суммы", () => {
  it("ничего не оплачено: предоплата 50% и полная оплата; оплачено — только остаток и своя сумма", () => {
    expect(amountOptions(30_000, 0)).toEqual({ left: 30_000, prepayment: 15_000, remainder: { amount: 30_000, purpose: "full" } });
    expect(amountOptions(30_000, 10_000)).toEqual({ left: 20_000, prepayment: null, remainder: { amount: 20_000, purpose: "remainder" } });
    expect(amountOptions(30_000, 30_000).left).toBe(0);
    expect(amountOptions(1, 0).prepayment).toBeNull();
  });

  it("своя сумма — целая, от 1 до остатка; всё оплачено — счёт не нужен", () => {
    expect(pickAmount("custom", 30_000, 10_000, "5000")).toEqual({ amount: 5_000, purpose: "custom" });
    expect(pickAmount("custom", 30_000, 10_000, "20000")).toEqual({ amount: 20_000, purpose: "custom" });
    for (const bad of ["", "0", "20001", "1.5", "-1", "abc"]) expect(pickAmount("custom", 30_000, 10_000, bad)).toEqual({ error: `Своя сумма — от 1 до ${price(20_000)} (остаток по договорённости)` });
    expect(pickAmount("remainder", 30_000, 10_000, "")).toEqual({ amount: 20_000, purpose: "remainder" });
    expect(pickAmount("prepayment", 30_000, 0, "")).toEqual({ amount: 15_000, purpose: "prepayment" });
    expect(pickAmount("prepayment", 30_000, 5_000, "")).toMatchObject({ error: expect.stringContaining("Предоплата 50%") });
    expect(pickAmount("remainder", 30_000, 30_000, "")).toEqual({ error: "По договорённости уже всё оплачено" });
  });

  it("лимит скидки — как на сервере: ниже прайса больше чем на N % нельзя, руководителю (null) — можно", () => {
    expect(discountProblem(30_000, 27_000, 10)).toBeNull();
    expect(discountProblem(30_000, 26_999, 10)).toContain("больше чем на 10%");
    expect(discountProblem(30_000, 1_000, null)).toBeNull();
    expect(discountProblem(undefined, 1_000, 10)).toBeNull();
  });

  it("предпросмотр — шаблон словаря pay на языке счёта, с номером Kaspi только при галочке", () => {
    const ru = invoicePreview({ locale: "ru", clientName: "Айгерим Сейткали", plan: "hardcover", purpose: "prepayment", amount: 15_000, link: "L", until: "24 октября", kaspiPhone: null });
    expect(ru).toContain("Здравствуйте, Айгерим!");
    expect(ru).toContain(`персональная книга (Твёрдая обложка), предоплата — ${price(15_000)}`);
    expect(ru).toContain("Оплатить: L");
    expect(ru).not.toContain("Kaspi на номер");
    const kk = invoicePreview({ locale: "kk", clientName: "", plan: "hardcover", purpose: "full", amount: 30_000, link: "L", until: "24 қазан", kaspiPhone: "+7 701 ••• •• 67" });
    expect(kk.startsWith("Сәлеметсіз бе!")).toBe(true);
    expect(kk).toContain("толық төлем");
    expect(kk).toContain("+7 701 ••• •• 67");
  });
});

describe("ключ формы счёта", () => {
  it("uuid v4 на каждое открытие — и в браузере без crypto.randomUUID (CRM по http)", () => {
    const uuid = z.string().uuid();
    const a = newIssueKey();
    expect(uuid.safeParse(a).success).toBe(true);
    expect(newIssueKey()).not.toBe(a);
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    try {
      const b = newIssueKey();
      expect(uuid.safeParse(b).success).toBe(true);
      expect(b[14]).toBe("4");
    } finally {
      delete (crypto as { randomUUID?: unknown }).randomUUID;
    }
    expect(typeof crypto.randomUUID).toBe("function");
  });
});

describe("форма счёта: разметка", () => {
  it("тариф и цена из сделки, суммы, способы, куда уйдёт счёт, предпросмотр", () => {
    const out = html(<InvoiceForm info={info()} issueKey="k" onClose={() => {}} />);
    expect(out).toContain("Предоплата 50%");
    expect(out).toContain("Полная оплата");
    expect(out).toContain(price(30_000));
    expect(out).toContain('value="30000"');
    expect(out).toContain("Клиент сможет оплатить: Kaspi · переводом по реквизитам");
    expect(out).toContain("Счёт уйдёт клиенту в чат WhatsApp");
    expect(out).toContain('data-testid="invoice-preview"');
    expect(out).toContain("Здравствуйте, Айгерим!");
    expect(out).toContain(`Выставить счёт на ${price(30_000)}`);
    expect(disabledButton(out, "Выставить счёт")).toBe(false);
    expect(out).not.toContain("Счёт Kaspi на номер");
  });

  it("часть оплачена — «Остаток» без предоплаты 50%", () => {
    const out = html(<InvoiceForm info={info({ paid: 10_000 })} issueKey="k" onClose={() => {}} />);
    expect(out).toContain("Остаток");
    expect(out).not.toContain("Предоплата 50%");
    expect(out).toContain(`остаток по договорённости: ${price(20_000)}`);
  });

  it("цена ниже лимита скидки — предупреждение и выпуск недоступен", () => {
    const out = html(<InvoiceForm info={info({ agreedTotal: 20_000 })} issueKey="k" onClose={() => {}} />);
    expect(out).toContain('data-testid="invoice-discount"');
    expect(disabledButton(out, "Выставить счёт")).toBe(true);
  });

  it("нет ни одного способа оплаты — сказано, что подключить в «Интеграциях», выпуск недоступен", () => {
    const out = html(<InvoiceForm info={info({ methods: { kaspi: false, card: false, transfer: false } })} issueKey="k" onClose={() => {}} />);
    expect(out).toContain("Нет способа оплаты: подключите Kaspi или укажите реквизиты перевода в «Интеграциях»");
    expect(out).toContain('href="/admin/settings"');
    expect(disabledButton(out, "Выставить счёт")).toBe(true);
  });

  it("по сделке уже заказ — вместо формы ссылка на заказ", () => {
    const out = html(<InvoiceForm info={info({ hasOrder: true, orderId: "o1" })} issueKey="k" onClose={() => {}} />);
    expect(out).toContain('href="/admin/orders/o1"');
    expect(out).not.toContain('data-testid="invoice-form"');
  });

  it("открытый счёт — предупреждение, что новый его заменит; Kaspi на номер — только маска; язык клиента kk", () => {
    const out = html(<InvoiceForm info={info({ open: { id: "i0", label: "P11", amount: 15_000 }, kaspiPhoneMasked: "+7 701 ••• •• 67", locale: "kk" })} issueKey="k" onClose={() => {}} />);
    expect(out).toContain(`Открыт счёт P11 на ${price(15_000)} — новый счёт его заменит`);
    expect(out).toContain("Счёт Kaspi на номер клиента +7 701 ••• •• 67");
    expect(out).toContain("Сәлеметсіз бе");
  });

  it("закрытая сделка — счёт не выставить", () => {
    expect(html(<InvoiceForm info={info({ closed: true })} issueKey="k" onClose={() => {}} />)).toContain("Сделка закрыта");
  });
});

describe("блок «Счета»: статусы и действия по правам", () => {
  it("статус по-человечески: ждёт, оплачен (способ, операция), отменён (причина), истёк", () => {
    expect(invoiceStatus(view())).toEqual({ text: "ждёт оплаты до 24 октября 2026 г., 10:00", tone: "wait" });
    expect(invoiceStatus(view({ status: "paid", paidLabel: "17 октября", paidMethod: "kaspi" }))).toEqual({ text: "оплачен 17 октября · Kaspi", tone: "ok" });
    expect(invoiceStatus(view({ status: "cancelled", closedReason: "выставлен новый счёт" })).text).toBe("отменён: выставлен новый счёт");
    expect(invoiceStatus(view({ status: "expired" })).tone).toBe("off");
    expect(invoiceStatus(view({ overdue: true })).text).toContain("истёк");
    expect(accessLabels.needs_manager).toContain("выберите клиента");
    expect(accessLabels.none).toBeNull();
  });

  it("действия: ждёт оплаты — ссылка, повтор, оплата пришла, отмена; без прав — ничего", () => {
    expect(invoiceActions(view(), all)).toEqual({ copy: true, resend: true, cancel: true, paid: true, access: false, pickAccount: false });
    expect(invoiceActions(view(), none)).toEqual({ copy: false, resend: false, cancel: false, paid: false, access: false, pickAccount: false });
    expect(invoiceActions(view({ hasChat: false }), all).resend).toBe(false);
    expect(invoiceActions(view({ overdue: true }), all)).toMatchObject({ copy: false, resend: false, cancel: true, paid: true });
    expect(invoiceActions(view({ status: "expired" }), all)).toMatchObject({ cancel: false, paid: true });
    expect(invoiceActions(view({ status: "cancelled" }), all)).toMatchObject({ cancel: false, paid: false });
  });

  it("доступ после оплаты: повтор — clients.create; «нужен менеджер» — только выбором аккаунта; «отправляется» — ждём", () => {
    const paid = (access: InvoiceView["access"]) => view({ status: "paid", access, link: null });
    expect(invoiceActions(paid("sent"), all)).toMatchObject({ access: true, pickAccount: false, paid: false, cancel: false });
    expect(invoiceActions(paid("failed"), all).access).toBe(true);
    expect(invoiceActions(paid("needs_manager"), all)).toMatchObject({ access: false, pickAccount: true });
    expect(invoiceActions(paid("due"), all)).toMatchObject({ access: false, pickAccount: false });
    expect(invoiceActions(paid("sent"), { ...all, access: false }).access).toBe(false);
  });

  it("разметка: номер, сумма, назначение, «клиент сообщил об оплате», доступ; кнопки по правам", () => {
    const list = [view(), view({ id: "i2", label: "P11", status: "paid", paidLabel: "16 октября", paidMethod: "kaspi", paidRef: "QR-77", access: "needs_manager", link: null }), view({ id: "i3", label: "P10", status: "cancelled", closedReason: "выставлен новый счёт", link: null, claimedLabel: null })];
    const out = html(<InvoicesBlock dealId="d1" invoices={[{ ...list[0], claimedLabel: "17 октября, 14:05" }, list[1], list[2]]} perms={all} onPaid={() => {}} />);
    for (const t of ["P12", "P11", "P10", price(15_000), "предоплата", "ждёт оплаты до", "оплачен 16 октября · Kaspi", "операция QR-77", "отменён: выставлен новый счёт", "Клиент сообщил об оплате переводом 17 октября, 14:05", "неясно, чей это аккаунт"]) expect(out).toContain(t);
    for (const t of ["Скопировать ссылку", "Отправить ещё раз", "Оплата пришла", "Отменить", "Выбрать аккаунт и отправить доступ"]) expect(out).toContain(t);
    const ro = html(<InvoicesBlock dealId="d1" invoices={list} perms={none} />);
    for (const t of ["Скопировать ссылку", "Отправить ещё раз", "Оплата пришла", "Отменить", "Выбрать аккаунт"]) expect(ro).not.toContain(t);
    expect(html(<InvoicesBlock dealId="d1" invoices={[]} perms={all} />)).toBe("");
  });

  it("в чате «Оплата пришла» ведёт в сделку с выбранным счётом", () => {
    expect(html(<InvoicesBlock dealId="d1" invoices={[view()]} perms={all} compact />)).toContain('href="/admin/deals/d1?pay=i1#deal-payments"');
  });
});

describe("финансы сделки: онлайн-платежи, переплата, выбор «по счёту»", () => {
  const base = { dealId: "d1", agreed: 30_000, plan: "hardcover", canEdit: true, canDelete: true, order: null };
  const online = { id: "p1", amount: 15_000, kind: "prepayment" as const, dateLabel: "16 октября 2026 г.", author: "система", note: "", receipts: [], online: "Kaspi · операция 123", invoice: "P12" };

  it("онлайн-платёж: операция и счёт вместо чека, без «нет чека» и без удаления", () => {
    const out = html(<PaymentsPanel {...base} payments={[online]} />);
    expect(out).toContain("Kaspi · операция 123 · счёт P12");
    expect(out).not.toContain("Нет чека");
    expect(out).not.toContain("Удалить платёж");
    expect(out).not.toContain('data-testid="attach-receipt"');
    const manual = { ...online, id: "p2", online: null, invoice: null };
    const out2 = html(<PaymentsPanel {...base} payments={[manual]} />);
    expect(out2).toContain("Нет чека");
    expect(out2).toContain("Удалить платёж");
    expect(out2).toContain('data-testid="attach-receipt"');
  });

  it("платёж, после которого оплачено больше договорённости, — «переплата»", () => {
    const pays = [
      { id: "a", amount: 20_000, kind: "prepayment" },
      { id: "b", amount: 15_000, kind: "payment" },
      { id: "r", amount: 10_000, kind: "refund" },
      { id: "c", amount: 5_000, kind: "payment" },
      { id: "d", amount: 1_000, kind: "payment" },
    ];
    // 20 000 → 35 000 (сверх) → возврат 25 000 → 30 000 (ровно договорённость) → 31 000 (сверх).
    expect([...overpaidPayments(pays, 30_000)]).toEqual(["b", "d"]);
    expect([...overpaidPayments(pays, 0)]).toEqual([]);
    const out = html(<PaymentsPanel {...base} payments={[{ ...online, id: "a", amount: 20_000 }, { ...online, id: "b", kind: "payment" }]} />);
    expect(out.match(/>переплата</g)).toHaveLength(1);
  });

  it("открытый счёт или онлайн-оплата за 72 ч — явный выбор «по счёту P12» или «это другая оплата»", () => {
    const guard = { invoice: { id: "i1", label: "P12", amount: 15_000 }, recentOnline: [{ id: "p1", text: `${price(15_000)} (Kaspi, счёт P11, 16 октября)` }] };
    expect(guardIds(guard)).toEqual(["i1", "p1"]);
    expect(choiceNeeded(guard)).toBe(true);
    expect(choiceNeeded({ invoice: null, recentOnline: [] })).toBe(false);
    const out = html(<PaymentsPanel {...base} payments={[]} invoices={[view()]} invoicePerms={all} guard={guard} />);
    expect(out).toContain('data-testid="payment-choice"');
    expect(out).toContain(`По счёту P12 — ${price(15_000)}`);
    expect(out).toContain("Это другая оплата");
    expect(out).toContain("Недавно уже пришла онлайн-оплата");
    expect(disabledButton(out, "Принять платёж с чеком")).toBe(true);
    expect(html(<PaymentsPanel {...base} payments={[]} />)).not.toContain('data-testid="payment-choice"');
  });

  it("«Оплата пришла» (?pay=): счёт выбран, сумма счёта и её не поменять", () => {
    const out = html(<PaymentsPanel {...base} payments={[]} invoices={[view({ status: "expired" })]} invoicePerms={all} guard={{ invoice: null, recentOnline: [] }} payInvoiceId="i1" />);
    expect(out).toMatch(/<input type="radio" name="payment-choice" checked=""/);
    expect(out).toContain("(истёк)");
    expect(out).toMatch(/<input readOnly=""[^>]*value="15000"/);
    expect(out).toContain("Принять оплату по счёту P12 с чеком");
    expect(disabledButton(out, "Принять оплату по счёту P12")).toBe(false);
  });

  it("кнопка «Счёт» — тому, кто может выставить, и пока нет заказа", () => {
    expect(html(<PaymentsPanel {...base} payments={[]} canIssue />)).toContain('data-testid="issue-invoice"');
    expect(html(<PaymentsPanel {...base} payments={[]} />)).not.toContain('data-testid="issue-invoice"');
    expect(html(<PaymentsPanel {...base} order={{ id: "o1", number: 3 }} payments={[]} canIssue />)).not.toContain('data-testid="issue-invoice"');
  });
});
