import { randomUUID } from "node:crypto";
import { DealInvoice, OrderingError, PaymentInvoice, type DealInvoiceRepository, type KaspiPaymentView, type PaymentInvoiceRepository, type PaymentTarget } from "@/modules/ordering/domain";
import type { InvoiceDeal, InvoiceSales } from "@/modules/ordering/application/DealInvoicesService";
import type { KaspiGateway } from "@/modules/ordering/application/ports";

// ─── двойники Kaspi и счетов из чата ───────────────────────────────────────

/** Журнал блокировок строк: порядок, в котором транзакция берёт таблицы (deal_invoices → payment_invoices → …). */
export type LockLog = string[];

/** Попытки оплаты Kaspi (payment_invoices) в памяти. */
export class MemInvoices implements PaymentInvoiceRepository {
  rows = new Map<string, ReturnType<PaymentInvoice["snapshot"]>>();
  private seq = 0;
  constructor(private readonly locks: LockLog = []) {}
  snapshot = () => new Map(this.rows);
  restore = (s: unknown) => (this.rows = structuredClone(s) as typeof this.rows);
  nextId = () => `inv-${++this.seq}`;
  private load(r?: ReturnType<PaymentInvoice["snapshot"]>) {
    if (!r) return null;
    const { id, ...p } = structuredClone(r);
    return PaymentInvoice.restore(id, p);
  }
  async findById(id: string) {
    return this.load(this.rows.get(id));
  }
  async lockById(id: string) {
    this.locks.push("payment_invoices");
    return this.load(this.rows.get(id));
  }
  async findByExternalId(_provider: "kaspi", externalId: string) {
    return this.load([...this.rows.values()].find((r) => r.externalId === externalId));
  }
  async latestFor(target: PaymentTarget) {
    const all = [...this.rows.values()].filter((r) => r.target.kind === target.kind && r.target.id === target.id);
    return this.load(all.at(-1));
  }
  async toReconcile(since: Date) {
    return [...this.rows.values()].filter((r) => (r.status === "pending" || r.status === "expired") && r.createdAt >= since).map((r) => this.load(r)!);
  }
  async dealInvoiceAttempts(since: Date) {
    return [...this.rows.values()].filter((r) => r.target.kind === "deal_invoice" && ["pending", "expired", "cancelled"].includes(r.status) && r.createdAt >= since).map((r) => this.load(r)!);
  }
  async add(i: PaymentInvoice) {
    this.rows.set(i.id, i.snapshot());
  }
  async save(i: PaymentInvoice) {
    this.rows.set(i.id, i.snapshot());
  }
}

/** kaspi-pos: созданные счета, отмены и статусы, которые «сообщит» Kaspi. */
export class FakeKaspi implements KaspiGateway {
  created: { method: "invoice" | "qr"; phone?: string; amount: number; comment?: string }[] = [];
  cancelled: string[] = [];
  statuses = new Map<string, { status: string; amount?: number }>();
  /** Kaspi ничего не знает об этих операциях (details → null). */
  silent = new Set<string>();
  /** Отвечать только о своих операциях (созданных этим двойником или со статусом в statuses): на общей базе чужие попытки не трогаем. */
  onlyKnown = false;
  private mine = new Set<string>();
  isConnected = true;
  down = false;
  /** Запрос статуса падает (kaspi-pos недоступен). */
  detailsDown = false;
  /** Отмена счёта падает. */
  cancelDown = false;
  private seq = 1000;
  constructor(private readonly prefix = "") {}
  async connected() {
    return this.isConnected;
  }
  private view(status = "RemotePaymentCreated", qr = false): KaspiPaymentView {
    const externalId = `${this.prefix}${++this.seq}`;
    this.mine.add(externalId);
    return { externalId, status, amount: null, checkoutUrl: qr ? "https://pay.kaspi.kz/pay/x" : null, qrToken: qr ? "https://pay.kaspi.kz/pay/x" : null, expiresAt: qr ? new Date("2026-10-01T10:05:00Z") : null };
  }
  async createInvoice(phone: string, amount: number, comment: string) {
    if (this.down) throw new OrderingError("kaspiUnavailable");
    this.created.push({ method: "invoice", phone, amount, comment });
    return this.view();
  }
  async createQr(amount: number) {
    this.created.push({ method: "qr", amount });
    return this.view("Wait", true);
  }
  async details(externalId: string) {
    if (this.detailsDown) throw new OrderingError("kaspiUnavailable");
    if (this.silent.has(externalId) || (this.onlyKnown && !this.mine.has(externalId) && !this.statuses.has(externalId))) return null;
    const s = this.statuses.get(externalId);
    return { externalId, status: s?.status ?? "RemotePaymentCreated", amount: s?.amount ?? null, checkoutUrl: null, qrToken: null, expiresAt: null };
  }
  async cancel(externalId: string) {
    if (this.cancelDown) throw new OrderingError("kaspiUnavailable");
    this.cancelled.push(externalId);
  }
}

/** Счета из чата (deal_invoices) в памяти; номера — с P12. */
export class MemDealInvoices implements DealInvoiceRepository {
  rows = new Map<string, ReturnType<DealInvoice["snapshot"]>>();
  private seq = 11;
  constructor(private readonly locks: LockLog = []) {}
  snapshot = () => ({ rows: new Map(this.rows), seq: this.seq });
  restore = (s: unknown) => Object.assign(this, structuredClone(s));
  async nextIdentity() {
    return { id: randomUUID(), number: ++this.seq };
  }
  private load(r?: ReturnType<DealInvoice["snapshot"]>) {
    if (!r) return null;
    const { id, ...p } = structuredClone(r);
    return DealInvoice.restore(id, p);
  }
  private find(test: (r: ReturnType<DealInvoice["snapshot"]>) => boolean) {
    return this.load([...this.rows.values()].find(test));
  }
  async findById(id: string) {
    return this.load(this.rows.get(id));
  }
  async findByToken(token: string) {
    return this.find((r) => r.token === token);
  }
  async findByNumber(n: number) {
    return this.find((r) => r.number === n);
  }
  async findByIssueKey(key: string) {
    return this.find((r) => r.issueKey === key);
  }
  async lockById(id: string) {
    this.locks.push("deal_invoices");
    return this.load(this.rows.get(id));
  }
  async lockDeal() {}
  async openFor(dealId: string) {
    return this.find((r) => r.dealId === dealId && r.status === "pending_payment");
  }
  async listFor(dealId: string) {
    return [...this.rows.values()].filter((r) => r.dealId === dealId).map((r) => this.load(r)!);
  }
  async overdue(now: Date) {
    return [...this.rows.values()].filter((r) => r.status === "pending_payment" && r.expiresAt < now).map((r) => this.load(r)!);
  }
  async accessDue() {
    return [...this.rows.values()].filter((r) => r.status === "paid" && r.accessStatus === "due").map((r) => this.load(r)!);
  }
  async add(i: DealInvoice) {
    this.rows.set(i.id, i.snapshot());
  }
  async save(i: DealInvoice) {
    this.rows.set(i.id, i.snapshot());
  }
}

/** Сделки и их деньги (контекст «Продажи») глазами счёта: платежи идемпотентны по операции, как индекс crm_payments_external_idx. */
export class FakeInvoiceSales implements InvoiceSales {
  deals = new Map<string, Omit<InvoiceDeal, "paid">>();
  payments: { id: string; dealId: string; amount: number; method: string; externalRef: string; invoiceId: string }[] = [];
  constructor(private readonly locks: LockLog = []) {}
  snapshot = () => ({ deals: new Map(this.deals), payments: [...this.payments] });
  restore = (s: unknown) => Object.assign(this, structuredClone(s));
  addDeal(id = "deal-1", extra: Partial<Omit<InvoiceDeal, "paid">> = {}) {
    this.deals.set(id, { id, number: 6, title: "Сделка", clientId: null, assigneeId: "staff-1", amount: 30000, orderId: null, closed: false, ...extra });
    return id;
  }
  async deal(id: string) {
    const d = this.deals.get(id);
    return d ? { ...d, paid: this.payments.filter((p) => p.dealId === id).reduce((s, p) => s + p.amount, 0) } : null;
  }
  async setAgreement() {}
  async acceptOnline(input: Parameters<InvoiceSales["acceptOnline"]>[0]) {
    this.locks.push("crm_deals");
    if (this.payments.some((p) => p.method === input.method && p.externalRef === input.externalRef)) return null;
    const id = `pay-${this.payments.length + 1}`;
    this.payments.push({ id, dealId: input.dealId, amount: input.amount, method: input.method, externalRef: input.externalRef, invoiceId: input.invoiceId });
    return { paymentId: id };
  }
}
