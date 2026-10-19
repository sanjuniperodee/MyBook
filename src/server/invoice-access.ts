import "server-only";
import { randomBytes } from "node:crypto";
import { env } from "@/config/env";
import { formatPrice, type PlanId } from "@/config/site";
import { messagesFor } from "@/i18n/messages";
import { formatPhone, normalizePhone, phoneTail } from "@/shared/domain/phone";
import type { Clock, Logger, StaffNotification } from "@/shared/application";
import { maskEmail, maskPhone } from "@/modules/access/domain";
import { IdentityError, isPhoneEmail } from "@/modules/identity/domain";
import { planLabels } from "@/modules/ordering/ui/labels";
import type { AccessStatus, DealInvoice, DealInvoiceClaimed, DealInvoiceExtraMoney, DealInvoicePaid } from "@/modules/ordering";
import type { Container } from "./container";

/**
 * Что происходит после оплаты счёта из чата (docs/features/chat-invoices.md, 0.3–0.4, 4.1–4.6, 5.4).
 *
 * Надёжная часть — шаг планировщика по состоянию счёта: markPaid ставит access_status='due', минутный проход берёт счёт
 * (захват access_attempted_at с таймаутом), находит или заводит клиента по номеру WhatsApp-чата, привязывает к нему
 * сделку, переписку, платежи и чеки, двигает сделку, пишет условия и задачу «получить остаток» и отправляет доступ в тот
 * же чат на языке счёта. Каждый шаг идемпотентен: повтор прохода находит заведённый аккаунт по номеру, служебные
 * заметки и задачи пишутся один раз. Подписчики событий (outbox, повторы до успеха) — только заметки и уведомления.
 *
 * Ссылка «задайте пароль» уходит клиенту целиком, а в CRM — только «ссылка отправлена» (переписка хранит её с маской).
 */

/** Захват выдачи доступа: упавший проход отпускает счёт через 10 минут. */
export const ACCESS_LEASE_MS = 10 * 60_000;
/** Ссылка «задайте пароль» действует трое суток. */
export const ACCESS_LINK_HOURS = 72;
/** Сколько после отправки следим за статусом доставки сообщения с доступом. */
const DELIVERY_WATCH_MS = 24 * 3600_000;
/** Ошибка доставки — одна формулировка для синхронной ошибки и позднего статуса: заметка и задача не дублируются. */
const NOT_DELIVERED = "WhatsApp не доставил сообщение";
/** Каналы WhatsApp: номер чата — подтверждённый телефон клиента. */
const WHATSAPP = new Set(["whatsapp", "wapi"]);

type FinalAccess = Exclude<AccessStatus, "none" | "due">;
type Locale = "ru" | "kk";
type Snapshot = ReturnType<DealInvoice["snapshot"]>;

export interface AccessAccount {
  id: string;
  role: string;
  email: string;
  name: string;
  phone: string | null;
}

export interface AccessDeal {
  id: string;
  number: number;
  title: string;
  clientId: string | null;
  assigneeId: string | null;
  /** Цена книги по договорённости. */
  amount: number;
  stageId: string;
}

export interface AccessStage {
  id: string;
  pipelineId: string;
  name: string;
  kind: string;
  position: number;
  milestone: string | null;
}

export interface AccessConversation {
  id: string;
  channel: string;
  chatId: string;
}

/** Порты к модулям — их собирает createInvoiceAccess из контейнера; в тестах — двойники. */
export interface InvoiceAccessPorts {
  invoices: {
    byId(id: string): Promise<DealInvoice | null>;
    listFor(dealId: string): Promise<DealInvoice[]>;
    accessDue(): Promise<DealInvoice[]>;
    accessSent(since: Date): Promise<DealInvoice[]>;
    claimAccess(id: string, leaseMs: number): Promise<DealInvoice | null>;
    finishAccess(id: string, claimedAt: Date, status: FinalAccess, userId: string | null, messageId: string | null): Promise<boolean>;
    setAccess(id: string, status: AccessStatus, userId?: string | null): Promise<void>;
    expireOverdue(): Promise<DealInvoice[]>;
  };
  deals: {
    find(id: string): Promise<AccessDeal | null>;
    paidTotal(dealId: string): Promise<number>;
    linkClient(dealId: string, clientId: string): Promise<void>;
    /** Платежи и чеки сделки без клиента (и записанные на fromClientId) — к клиенту. */
    assignMoney(dealId: string, clientId: string, fromClientId: string | null): Promise<void>;
    stages(): Promise<AccessStage[]>;
    move(dealId: string, stageId: string): Promise<void>;
  };
  accounts: {
    find(id: string): Promise<AccessAccount | null>;
    /** Клиенты (role=user) с этим основным телефоном. */
    byPhone(phone: string): Promise<AccessAccount[]>;
    /** Клиенты, у которых номер — только доп. телефон или контакт заказа. */
    byOtherPhone(phone: string): Promise<AccessAccount[]>;
    usage(id: string): Promise<{ lastSeenAt: Date | null; books: number; orders: number }>;
    /** Завести клиента по телефону; existingId — логин с этим номером уже занят (почта-заглушка у другого аккаунта). */
    provision(input: { name: string; phone: string; locale: Locale; channel: string; assigneeId: string | null }): Promise<{ id: string } | { existingId: string | null }>;
    issueAccessLink(userId: string, ttlMs: number): Promise<{ token: string; login: string }>;
    /** Ссылка сброса пароля на настоящую почту клиента. */
    mailPasswordReset(email: string, locale: Locale): Promise<void>;
    isAdminEmail(email: string): boolean;
  };
  chats: {
    conversation(id: string): Promise<AccessConversation | null>;
    /** Сообщение клиенту от CRM; status 'error' — не ушло. */
    send(conversationId: string, text: string): Promise<{ id: string; status: string }>;
    /** Внутренняя заметка в чате (видят только сотрудники). */
    note(conversationId: string, text: string): Promise<void>;
    hasNote(conversationId: string, text: string): Promise<boolean>;
    messageStatus(id: string): Promise<string | null>;
    linkClient(conversationId: string, clientId: string): Promise<void>;
    linkDealClient(dealId: string, clientId: string): Promise<void>;
  };
  crm: {
    /** Запись CRM в ленте сделки, одна с таким текстом; true — записана сейчас. */
    noteOnce(input: { dealId: string; clientId: string | null; text: string }): Promise<boolean>;
    /** Задача ответственному, одна открытая с таким заголовком по сделке; true — поставлена сейчас. */
    taskOnce(input: { dealId: string; clientId: string | null; title: string; assigneeId: string }): Promise<boolean>;
    /** Закрыть устаревшие служебные задачи сделки по началу заголовка (кроме keepTitle). */
    closeTasks(input: { dealId: string; prefix: string; keepTitle: string | null }): Promise<number>;
    notify(userIds: string[], n: StaffNotification): Promise<void>;
    /** Всем, кто ведёт сделки (deals.edit), — когда ответственного нет. */
    notifyEditors(n: StaffNotification): Promise<void>;
  };
  mail: {
    /** Письмо клиенту «оплата получена» (только на настоящую почту). */
    paymentReceived(input: { clientId: string; dealNumber: number; amount: number; left: number }): Promise<void>;
  };
  links: {
    login(locale: Locale): string;
    reset(token: string, locale: Locale): string;
  };
  clock: Clock;
  logger: Pick<Logger, "error">;
}

// ─── правила (чистые функции) ───────────────────────────────────────────────

/**
 * Этап «предоплата получена»: в воронке такой вехи нет (вехи — действия на сайте), поэтому — открытый этап воронки
 * сделки с «предоплат» в названии, если руководитель его завёл, иначе «Взяли в работу» (второй открытый этап без вехи:
 * договорённость есть, клиент ещё не начал книгу). Только вперёд: сделку, ушедшую дальше (пишет книгу), и закрытую не трогаем.
 */
export function prepaidStage(stages: readonly AccessStage[], currentStageId: string): AccessStage | null {
  const current = stages.find((s) => s.id === currentStageId);
  if (!current || current.kind !== "open") return null;
  const open = stages.filter((s) => s.pipelineId === current.pipelineId && s.kind === "open").sort((a, b) => a.position - b.position);
  const manual = open.filter((s) => !s.milestone);
  const target = open.find((s) => /предоплат/i.test(s.name)) ?? manual.find((s) => s.name.trim().toLowerCase() === "взяли в работу") ?? manual[1] ?? null;
  return target && target.position > current.position ? target : null;
}

/** Аккаунтом не пользовались: не заходил, книг и заказов нет — ему ссылка «задайте пароль». */
export const isUnusedAccount = (u: { lastSeenAt: Date | null; books: number; orders: number }) => !u.lastSeenAt && u.books === 0 && u.orders === 0;

/** Имя из счёта, если это имя, а не номер или «…4567» (контакт заявки без имени). */
const personName = (raw: string) => {
  const name = raw.trim().replace(/\s+/g, " ");
  return /\p{L}/u.test(name) ? name : "";
};

/** Кандидат для менеджера — без полного номера и почты. */
const candidateLabel = (a: AccessAccount) => [a.name || "без имени", a.phone ? phoneTail(a.phone) : null, isPhoneEmail(a.email) ? null : maskEmail(a.email)].filter(Boolean).join(", ");

const methodLabel = (m: string) => (m === "kaspi" ? "Kaspi" : m === "cloudpayments" ? "карта" : "перевод");
const isOnline = (m: string | null) => m === "kaspi" || m === "cloudpayments";
const label = (number: number) => `P${number}`;

type ManagerReason = "noDeal" | "noPhone" | "notWhatsapp" | "several" | "otherClient" | "weakMatch" | "loginTaken" | "notClient";
const reasons: Record<ManagerReason, string> = {
  noDeal: "у счёта нет сделки",
  noPhone: "у счёта нет номера WhatsApp",
  notWhatsapp: "счёт выставлен не из WhatsApp-чата",
  several: "с номером чата несколько аккаунтов",
  otherClient: "сделка привязана к другому клиенту",
  weakMatch: "номер чата есть у клиента только доп. телефоном или в заказе",
  loginTaken: "логин с номером чата уже занят другим аккаунтом",
  notClient: "аккаунт не клиентский (сотрудник или служебный адрес)",
};

type Resolution =
  | { kind: "account"; account: AccessAccount; created: boolean; chosen: boolean }
  | { kind: "manager"; reason: ManagerReason; candidates: AccessAccount[] };

// ─── сервис ─────────────────────────────────────────────────────────────────

export class InvoiceAccess {
  constructor(private readonly p: InvoiceAccessPorts) {}

  /** Минутный проход: сначала доставка уже отправленного, потом выдача ждущих. */
  async run(): Promise<{ processed: number; failed: number }> {
    const failed = await this.checkDelivery();
    let processed = 0;
    for (const invoice of await this.p.invoices.accessDue()) {
      if (await this.process(invoice.id)) processed++;
    }
    return { processed, failed };
  }

  /**
   * Выдать доступ по одному счёту (проход планировщика или сразу после оплаты). Счёт берётся захватом: параллельный
   * проход его пропустит. Ошибка — в журнал, счёт освободится по таймауту и будет взят снова.
   */
  async process(invoiceId: string): Promise<FinalAccess | null> {
    const invoice = await this.p.invoices.claimAccess(invoiceId, ACCESS_LEASE_MS);
    const claimedAt = invoice?.access.attemptedAt;
    if (!invoice || !claimedAt) return null;
    try {
      const { status, userId, messageId } = await this.grant(invoice);
      await this.p.invoices.finishAccess(invoice.id, claimedAt, status, userId, messageId);
      return status;
    } catch (err) {
      this.p.logger.error(`invoice ${invoice.label} access`, err);
      return null;
    }
  }

  private async grant(invoice: DealInvoice): Promise<{ status: FinalAccess; userId: string | null; messageId: string | null }> {
    const s = invoice.snapshot();
    const t = messagesFor(s.locale).access;
    const deal = await this.p.deals.find(s.dealId);
    const conv = s.conversationId ? await this.p.chats.conversation(s.conversationId) : null;
    // Повтор по просьбе менеджера (выбрал аккаунт, «Отправить доступ ещё раз») или после ошибки — уже не первая выдача.
    const repeat = !!s.accessUserId || !!s.accessMessageId;
    const target = await this.resolve(s, deal, conv);
    const greeting = { name: personName(s.clientName).split(" ")[0] ?? "", label: invoice.label, amount: formatPrice(s.amount) };

    if (target.kind === "manager") {
      // Клиенту — нейтрально, без логина (чей аккаунт, решит менеджер); один раз на счёт.
      const msg = conv && !repeat ? await this.p.chats.send(conv.id, t.manager(greeting)) : null;
      await this.askManager(s, deal, target.reason, target.candidates);
      return { status: "needs_manager", userId: null, messageId: msg?.id ?? s.accessMessageId };
    }

    const { account } = target;
    // Привязка — при первой выдаче и когда менеджер выбрал аккаунт; повторная отправка доступа её не повторяет.
    if (deal && (!repeat || deal.clientId !== account.id)) await this.link(s, deal, conv, account);
    // Доступ — один раз на клиента и сделку: следующие оплаты — коротко «оплата получена», доступ не нужен (skipped).
    const granted = !repeat && (await this.p.invoices.listFor(s.dealId)).some((o) => o.id !== invoice.id && o.access.userId === account.id && (o.access.status === "sent" || o.access.status === "delivered"));
    if (!conv) {
      if (granted) return { status: "skipped", userId: account.id, messageId: null };
      await this.reportFailure(s, deal, null, "у счёта нет чата — передайте клиенту доступ сами");
      return { status: "failed", userId: account.id, messageId: null };
    }
    if (granted) {
      const msg = await this.p.chats.send(conv.id, t.paid({ ...greeting, loginUrl: this.p.links.login(s.locale) }));
      if (deal) await this.p.crm.noteOnce({ dealId: deal.id, clientId: account.id, text: `Счёт ${invoice.label}: доступ в кабинет по этой сделке клиент уже получил — повторно не отправляли, в чат ушло «оплата получена».` });
      return { status: "skipped", userId: account.id, messageId: msg.id };
    }

    // Логин в тексте — без полного номера и почты: переписку в CRM видят и менеджеры, которым номера клиентов закрыты.
    // Нашли или завели по номеру чата — входит по этому номеру; иначе — почта или номер с маской (клиент свои узнает).
    const byChatNumber = !target.chosen && normalizePhone(account.phone) === normalizePhone(s.phone);
    const login = byChatNumber ? t.thisNumber : !isPhoneEmail(account.email) ? maskEmail(account.email) : maskPhone(account.phone);

    let text: string;
    let what: string;
    if (target.created || isUnusedAccount(await this.p.accounts.usage(account.id))) {
      const link = await this.p.accounts.issueAccessLink(account.id, ACCESS_LINK_HOURS * 3600_000);
      text = t.setPassword({ ...greeting, link: this.p.links.reset(link.token, s.locale), login, hours: ACCESS_LINK_HOURS });
      what = `ссылка «задайте пароль» (действует ${ACCESS_LINK_HOURS} ч)`;
    } else {
      // Аккаунтом пользуются: ссылку сброса в чат не шлём (номер мог перейти к другому человеку) — только на почту.
      const real = !isPhoneEmail(account.email);
      if (real) await this.p.accounts.mailPasswordReset(account.email, s.locale);
      text = t.loginAsUsual({ ...greeting, loginUrl: this.p.links.login(s.locale), login, emailMasked: real ? maskEmail(account.email) : null });
      what = `«войдите как обычно»${real ? ", ссылка для нового пароля — на почту клиента" : ""}`;
    }
    const msg = await this.p.chats.send(conv.id, text);
    if (msg.status === "error") {
      await this.reportFailure(s, deal, conv.id, NOT_DELIVERED);
      return { status: "failed", userId: account.id, messageId: msg.id };
    }
    if (deal) await this.p.crm.noteOnce({ dealId: deal.id, clientId: account.id, text: `Доступ в кабинет по счёту ${invoice.label} отправлен клиенту в чат: ${what}.` });
    return { status: "sent", userId: account.id, messageId: msg.id };
  }

  /**
   * Чей аккаунт (4.1): решает номер WhatsApp-чата счёта, а не deal.clientId. Ровно один клиент с этим основным
   * номером — он; никого и у сделки нет клиента — заводим; иначе (чужой клиент сделки, несколько совпадений, номер
   * только доп. телефоном или в заказе, номера нет, чат не WhatsApp, логин занят) — никого не привязываем, решает
   * менеджер. Выбранный менеджером аккаунт — без поиска по телефону.
   */
  private async resolve(s: Snapshot, deal: AccessDeal | null, conv: AccessConversation | null): Promise<Resolution> {
    const manager = (reason: ManagerReason, candidates: (AccessAccount | null)[] = []): Resolution => ({ kind: "manager", reason, candidates: candidates.filter((c): c is AccessAccount => !!c) });
    if (s.accessUserId) {
      const chosen = await this.p.accounts.find(s.accessUserId);
      return chosen && this.isClient(chosen) ? { kind: "account", account: chosen, created: false, chosen: true } : manager("notClient", [chosen]);
    }
    if (!deal) return manager("noDeal");
    const dealClient = deal.clientId ? await this.p.accounts.find(deal.clientId) : null;
    const phone = normalizePhone(s.phone);
    if (phone.length < 10) return manager("noPhone", [dealClient]);
    if (!conv || !WHATSAPP.has(conv.channel) || normalizePhone(conv.chatId) !== phone) return manager("notWhatsapp", [dealClient]);
    const found = await this.p.accounts.byPhone(phone);
    if (found.length > 1) return manager("several", found);
    const [match] = found;
    if (match) {
      if (!this.isClient(match)) return manager("notClient", [match]);
      if (deal.clientId && deal.clientId !== match.id) return manager("otherClient", [match, dealClient]);
      return { kind: "account", account: match, created: false, chosen: false };
    }
    if (deal.clientId) return manager("otherClient", [dealClient]);
    // Номер — только доп. телефон или контакт заказа: это не подтверждение, но и второй аккаунт тому же человеку не заводим.
    const weak = await this.p.accounts.byOtherPhone(phone);
    if (weak.length) return manager("weakMatch", weak);
    const made = await this.p.accounts.provision({ name: personName(s.clientName) || formatPhone(phone), phone, locale: s.locale, channel: s.channel, assigneeId: deal.assigneeId ?? s.issuedById });
    if (!("id" in made)) return manager("loginTaken", [made.existingId ? await this.p.accounts.find(made.existingId) : null]);
    const account = await this.p.accounts.find(made.id);
    return account ? { kind: "account", account, created: true, chosen: false } : manager("loginTaken");
  }

  /** Клиент, которому можно выдать доступ: role=user и не адрес из ADMIN_EMAILS (их права даёт только сброс по почте). */
  private isClient(a: AccessAccount) {
    return a.role === "user" && !this.p.accounts.isAdminEmail(a.email);
  }

  /**
   * Привязка: сделка и её переписка → клиент; платежи и чеки сделки без клиента → он (выручка считается по строкам
   * платежей — без задвоения); сделка вперёд на «предоплата получена»; заметка с условиями; задача «получить остаток».
   */
  private async link(s: Snapshot, deal: AccessDeal, conv: AccessConversation | null, account: AccessAccount) {
    const previous = deal.clientId;
    if (previous !== account.id) {
      await this.p.deals.linkClient(deal.id, account.id);
      if (previous) await this.p.crm.noteOnce({ dealId: deal.id, clientId: account.id, text: `Сделка перепривязана к клиенту ${account.name || "без имени"} — его аккаунт выбрал менеджер по счёту ${label(s.number)}.` });
    }
    await this.p.deals.assignMoney(deal.id, account.id, previous && previous !== account.id ? previous : null);
    await this.p.chats.linkDealClient(deal.id, account.id);
    if (conv) await this.p.chats.linkClient(conv.id, account.id);

    const stage = prepaidStage(await this.p.deals.stages(), deal.stageId);
    if (stage) await this.p.deals.move(deal.id, stage.id);

    const books = s.booksCount ?? 1;
    const perBook = deal.amount > 0 ? deal.amount : s.agreedTotal;
    const agreed = perBook * books;
    const paid = await this.p.deals.paidTotal(deal.id);
    const left = Math.max(0, agreed - paid);
    const login = isPhoneEmail(account.email) ? `вход по телефону ${phoneTail(account.phone ?? s.phone)}` : `вход по почте ${maskEmail(account.email)}`;
    const terms = [
      `Счёт ${label(s.number)} оплачен (${methodLabel(s.paidMethod ?? "manual")}): ${formatPrice(s.amount)}.`,
      `Условия: тариф «${planLabels[s.plan as PlanId] ?? s.plan}», договорённость ${formatPrice(perBook)} за книгу${books > 1 ? ` × ${books} кн. = ${formatPrice(agreed)}` : ""}, оплачено всего ${formatPrice(paid)}${left > 0 ? `, остаток ${formatPrice(left)}` : " — договорённость оплачена полностью"}.`,
      `Клиент на сайте: ${account.name || "без имени"}, ${login}, язык кабинета — ${s.locale === "kk" ? "казахский" : "русский"}.`,
    ].join("\n");
    await this.p.crm.noteOnce({ dealId: deal.id, clientId: account.id, text: terms });
    const remainderTitle = left > 0 ? `${REMAINDER_TASK}${formatPrice(left)} по договорённости (сделка №${deal.number}, оплачен счёт ${label(s.number)})` : null;
    // Прежние «получить остаток» устарели: остаток оплачен или стал меньше — закрываем, ставим одну актуальную.
    await this.p.crm.closeTasks({ dealId: deal.id, prefix: REMAINDER_TASK, keepTitle: remainderTitle });
    if (remainderTitle) await this.alert(s, { ...deal, clientId: account.id }, remainderTitle, { note: false, fresh: false });
    // Письмо «оплата получена» — только онлайн-оплата, только на настоящую почту и только при первой выдаче.
    if (isOnline(s.paidMethod) && !s.accessMessageId && !isPhoneEmail(account.email)) await this.p.mail.paymentReceived({ clientId: account.id, dealNumber: deal.number, amount: s.amount, left });
  }

  /** Чей аккаунт — неясно: никого не привязываем, менеджеру задача с кандидатами (без полных номеров). */
  private async askManager(s: Snapshot, deal: AccessDeal | null, reason: ManagerReason, candidates: AccessAccount[]) {
    const who = candidates.length ? ` Кандидаты: ${[...new Map(candidates.map((c) => [c.id, candidateLabel(c)])).values()].join("; ")}.` : "";
    const title = `Подтвердите, чей это аккаунт: счёт ${label(s.number)} оплачен (${formatPrice(s.amount)}), доступ в кабинет не отправлен — ${reasons[reason]}.${who}`;
    if (deal) await this.alert(s, deal, title);
    else await this.p.crm.notifyEditors({ kind: "task", title, body: "", link: "/admin/deals" });
  }

  /** Доступ не ушёл: одна внутренняя заметка в чате и одна задача; новых ссылок не выпускаем. */
  private async reportFailure(s: Snapshot, deal: AccessDeal | null, conversationId: string | null, why: string) {
    const text = `Доступ в кабинет по счёту ${label(s.number)} не ушёл клиенту: ${why}. Отправим ещё раз, когда клиент напишет в этот чат; можно и вручную — «Отправить доступ ещё раз» в счёте.`;
    if (conversationId) {
      if (await this.p.chats.hasNote(conversationId, text)) return;
      await this.p.chats.note(conversationId, text);
    }
    // С чатом повтор отсекает заметка в чате выше; без чата — запись в ленте сделки.
    if (deal) await this.alert(s, deal, `Доступ в кабинет по счёту ${label(s.number)} не ушёл клиенту — ${why}`, conversationId ? { note: false, fresh: true } : {});
  }

  /**
   * Служебное событие по сделке: запись в ленте (одна), задача ответственному сделки (иначе — выставившему счёт; одна
   * открытая) и уведомление — только когда задача или запись появились сейчас (повтор события не будит людей дважды).
   */
  private async alert(s: Pick<Snapshot, "issuedById">, deal: AccessDeal, title: string, opts: { note?: boolean; fresh?: boolean; body?: string } = {}) {
    const fresh = opts.note === false ? !!opts.fresh : await this.p.crm.noteOnce({ dealId: deal.id, clientId: deal.clientId, text: title });
    const assigneeId = deal.assigneeId ?? s.issuedById;
    const n: StaffNotification = { kind: "task", title, body: opts.body ?? deal.title, link: `/admin/deals/${deal.id}` };
    if (assigneeId) {
      if (await this.p.crm.taskOnce({ dealId: deal.id, clientId: deal.clientId, title, assigneeId })) await this.p.crm.notify([assigneeId], n);
    } else if (fresh) await this.p.crm.notifyEditors(n);
  }

  /** Статус доставки отправленного доступа: ошибка — «не ушёл» (заметка и задача один раз), доставлено — «доставлен». */
  async checkDelivery(): Promise<number> {
    let failed = 0;
    for (const invoice of await this.p.invoices.accessSent(new Date(this.p.clock.now().getTime() - DELIVERY_WATCH_MS))) {
      const { messageId } = invoice.access;
      if (!messageId) continue;
      const status = await this.p.chats.messageStatus(messageId);
      if (status === "error") {
        const s = invoice.snapshot();
        await this.p.invoices.setAccess(invoice.id, "failed");
        await this.reportFailure(s, await this.p.deals.find(s.dealId), s.conversationId, NOT_DELIVERED);
        failed++;
      } else if (status === "delivered" || status === "read") await this.p.invoices.setAccess(invoice.id, "delivered");
    }
    return failed;
  }

  /**
   * Клиент написал в чат счёта, по которому доступ не ушёл (окно WhatsApp снова открыто): отправить ещё раз — один раз
   * на счёт (отметка — внутренняя заметка в чате). Дальше — только менеджер.
   */
  async onIncoming(ctx: { conversationId: string; dealId: string | null }) {
    if (!ctx.dealId) return;
    for (const invoice of await this.p.invoices.listFor(ctx.dealId)) {
      const s = invoice.snapshot();
      if (s.accessStatus !== "failed" || s.conversationId !== ctx.conversationId) continue;
      const marker = `Клиент написал в чат — отправляем доступ в кабинет по счёту ${invoice.label} ещё раз (автоматически, один раз).`;
      if (await this.p.chats.hasNote(ctx.conversationId, marker)) continue;
      await this.p.chats.note(ctx.conversationId, marker);
      await this.p.invoices.setAccess(invoice.id, "due");
    }
  }

  /** Проход истечения: просроченные счета — «истёк», ответственному задача связаться с клиентом. */
  async expire(): Promise<number> {
    const expired = await this.p.invoices.expireOverdue();
    for (const invoice of expired) {
      const s = invoice.snapshot();
      const deal = await this.p.deals.find(s.dealId);
      if (deal) await this.alert(s, deal, `Счёт ${invoice.label} истёк неоплаченным — свяжитесь с клиентом`);
    }
    return expired.length;
  }

  // ─── подписчики событий счёта (заметки и уведомления) ──────────────────────

  /** Оплачен онлайн: запись в сделке «Оплачен счёт P12 — 15 000 ₸ (Kaspi, операция …)». Ручной путь её уже сделал. */
  async paidNote(e: DealInvoicePaid["payload"]) {
    if (e.method === "manual") return;
    const deal = await this.p.deals.find(e.dealId);
    if (deal) await this.p.crm.noteOnce({ dealId: deal.id, clientId: deal.clientId, text: `Оплачен счёт ${label(e.number)} — ${formatPrice(e.amount)} (${methodLabel(e.method)}, операция ${e.ref ?? "—"})` });
  }

  /** Оплачен (онлайн или переводом с чеком): уведомление ответственному, иначе выставившему, иначе всем с deals.edit. */
  async paidNotify(e: DealInvoicePaid["payload"]) {
    const deal = await this.p.deals.find(e.dealId);
    const n: StaffNotification = { kind: "deal", title: `Оплачен счёт ${label(e.number)} — ${formatPrice(e.amount)} (${methodLabel(e.method)})`, body: deal ? `Сделка №${deal.number}: ${deal.title}` : "", link: deal ? `/admin/deals/${deal.id}` : "/admin/deals" };
    const to = deal?.assigneeId ?? e.issuedById;
    if (to) await this.p.crm.notify([to], n);
    else await this.p.crm.notifyEditors(n);
  }

  /** Деньги, которые этим счётом не засчитать: повторная оплата — возврат; по закрытому счёту или после заказа — возврат или зачёт. */
  async extraMoney(e: DealInvoiceExtraMoney["payload"]) {
    const deal = await this.p.deals.find(e.dealId);
    const how = `${methodLabel(e.method)}, операция ${e.ref}`;
    const title =
      e.reason === "mismatch"
        ? `Оплата ${formatPrice(e.paid)} по счёту ${label(e.number)} не совпала с суммой счёта ${formatPrice(e.amount)} (${how}) — не засчитана, разберитесь: возврат или доплата`
        : e.reason === "overpaid"
        ? `Повторная оплата по счёту ${label(e.number)}: ${formatPrice(e.paid)} (${how}) — нужен возврат`
        : `Оплата ${formatPrice(e.paid)} пришла по закрытому счёту ${label(e.number)} (${how}) — нужен возврат или зачёт в заказ`;
    const invoice = await this.p.invoices.byId(e.invoiceId);
    const issuedById = invoice?.snapshot().issuedById ?? null;
    const body = e.recorded ? "Деньги записаны в сделку" : "В сделку деньги не записаны";
    if (deal) await this.alert({ issuedById }, deal, title, { body });
    else await this.p.crm.notifyEditors({ kind: "task", title, body, link: "/admin/deals" });
  }

  /** Клиент нажал «Я оплатил(а)»: ответственному — проверить поступление перевода. */
  async claimed(e: DealInvoiceClaimed["payload"]) {
    const deal = await this.p.deals.find(e.dealId);
    if (!deal) return;
    const invoice = await this.p.invoices.byId(e.invoiceId);
    await this.alert({ issuedById: invoice?.snapshot().issuedById ?? null }, deal, `Клиент сообщил, что оплатил переводом по счёту ${label(e.number)} (${formatPrice(e.amount)}) — проверьте поступление`);
  }
}

// ─── сборка из контейнера ───────────────────────────────────────────────────

/** Начало заголовка задачи «получить остаток» — по нему прежние такие задачи закрываются. */
const REMAINDER_TASK = "Получить остаток ";

const localePrefix = (locale: Locale) => (locale === "kk" ? "/kk" : "");

/** Порты к модулям приложения: identity, clients, sales, messaging, ordering, workspace. */
export function createInvoiceAccess(c: Container): InvoiceAccess {
  const account = (u: { id: string; role: string; email: string; name: string; phone: string | null } | null): AccessAccount | null => (u ? { id: u.id, role: u.role, email: u.email, name: u.name, phone: u.phone } : null);
  const system = (userId: string) => ({ userId, name: "CRM", seesAll: true, allTasks: true });
  return new InvoiceAccess({
    invoices: c.ordering.invoices,
    deals: {
      find: (id) => c.sales.deals.findById(id),
      paidTotal: (dealId) => c.sales.payments.paidTotal(dealId),
      // Книги пакета (счёт на несколько книг) — того же клиента.
      linkClient: async (dealId, clientId) => {
        await c.sales.deals.linkClient(dealId, clientId);
        for (const b of await c.sales.batch.of(dealId)) if (b.id !== dealId) await c.sales.deals.linkClient(b.id, clientId);
      },
      assignMoney: (dealId, clientId, from) => c.sales.payments.assignClient(dealId, clientId, from),
      stages: () => c.sales.queries.listStages(),
      move: async (dealId, stageId) => void (await c.sales.deals.move(dealId, stageId, null)),
    },
    accounts: {
      find: async (id) => account(await c.identity.accounts.account(id)),
      byPhone: async (phone) => (await c.identity.accounts.clientsByPhone(phone)).map((u) => account(u)!),
      byOtherPhone: (phone) => c.clients.accountsByOtherPhones(phone),
      usage: (id) => c.clients.usage(id),
      provision: async (input) => {
        try {
          const made = await c.clients.onboarding.onboardFromPayment({ ...input, password: randomBytes(24).toString("base64url") });
          return { id: made.clientId };
        } catch (err) {
          if (IdentityError.is(err) && err.code === "exists") return { existingId: (err as unknown as { existingId?: string }).existingId ?? null };
          throw err;
        }
      },
      issueAccessLink: (userId, ttlMs) => c.identity.auth.issueAccessLink(userId, ttlMs),
      mailPasswordReset: (email, locale) => c.identity.auth.requestPasswordReset(email, locale),
      isAdminEmail: (email) => env.adminEmails.includes(email.trim().toLowerCase()),
    },
    chats: {
      conversation: (id) => c.messaging.queries.conversation(id),
      send: (conversationId, text) => c.messaging.chats.send(conversationId, text, null),
      note: async (conversationId, text) => void (await c.messaging.chats.addInternalNote(conversationId, text, null)),
      hasNote: (conversationId, text) => c.messaging.queries.hasInternalNote(conversationId, text),
      messageStatus: (id) => c.messaging.queries.messageStatus(id),
      linkClient: (conversationId, clientId) => c.messaging.chats.linkClient(conversationId, clientId),
      linkDealClient: (dealId, clientId) => c.messaging.chats.linkDealClient(dealId, clientId),
    },
    crm: {
      noteOnce: (input) => c.clients.notes.addSystemOnce(input),
      closeTasks: (input) => c.clients.tasks.closeOpenByPrefix(input),
      taskOnce: (input) => c.clients.tasks.createOnce(system(input.assigneeId), { title: input.title, kind: "task", dealId: input.dealId, clientId: input.clientId ?? undefined, assigneeId: input.assigneeId }),
      notify: (userIds, n) => c.workspace.notifier.notify(userIds, n),
      notifyEditors: (n) => c.workspace.notifier.notifyAllWith("deals.edit", n),
    },
    mail: { paymentReceived: async (input) => (await import("./client-mail")).mailPaymentToClient(c, { ...input, kind: "payment" }) },
    links: {
      login: (locale) => `${env.appUrl}${localePrefix(locale)}/login`,
      reset: (token, locale) => `${env.appUrl}${localePrefix(locale)}/reset/${token}`,
    },
    clock: c.clock,
    logger: { error: (msg, err) => console.error(`[invoice-access] ${msg}`, err) },
  });
}
