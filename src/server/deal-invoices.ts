import "server-only";
import { formatPrice } from "@/config/site";
import { messagesFor } from "@/i18n/messages";
import { planName } from "@/i18n/labels";
import { maskPhone } from "@/modules/access";
import type { BotInvoices } from "@/modules/messaging";
import { OrderingError, isOnlinePayment, kaspiPhone, type DealInvoice } from "@/modules/ordering";
import { sourceFromChannel } from "@/modules/sales";
import { isManualChannel } from "@/shared/domain/channels";
import { isPhoneLike, normalizePhone } from "@/shared/domain/phone";
import { storeTimeZone } from "@/shared/domain/time";
import { env } from "@/config/env";
import { container } from "./container";
import { transferRequisites } from "./requisites";

/** Ссылка на оплату счёта — на языке счёта (/pay или /kk/pay). */
export const payLink = (invoice: DealInvoice) => `${env.appUrl}${invoice.snapshot().locale === "kk" ? "/kk" : ""}/pay/${invoice.token}`;

/** Способы оплаты, которые увидит клиент; пусто — выставлять счёт нельзя. */
export async function availableMethods() {
  const c = container();
  const [kaspi, transfer] = await Promise.all([c.ordering.kaspi.available().catch(() => false), transferRequisites()]);
  return { kaspi, card: isOnlinePayment(), transfer: !!transfer };
}

/** Мобильный Казахстана (77XXXXXXXXX, без городских 7172/727…) — на него можно выставить счёт Kaspi. */
export const isKzMobile = (digits: string | null) => !!kaspiPhone(digits);

/** Текст счёта для клиента — на языке счёта; номер для счёта Kaspi показываем с маской. */
export function invoiceText(invoice: DealInvoice, kaspi: { phone: string; org: string | null } | null = null) {
  const s = invoice.snapshot();
  const t = messagesFor(s.locale).pay;
  const until = new Intl.DateTimeFormat(s.locale === "kk" ? "kk-KZ" : "ru-RU", { timeZone: storeTimeZone(), day: "numeric", month: "long" }).format(s.expiresAt);
  const gifts = s.gifts.length ? s.gifts.map((g) => messagesFor(s.locale).common.agreementGifts[g]).join(", ") : null;
  return t.message({ name: s.clientName.split(" ")[0] ?? "", label: invoice.label, plan: planName(s.plan, s.locale), books: s.booksCount, purpose: t.purpose[s.purpose], amount: formatPrice(s.amount), link: payLink(invoice), until, kaspiPhone: kaspi ? maskPhone(kaspi.phone) : null, kaspiOrg: kaspi?.org ?? null, gifts });
}

/** Тексты для менеджера, когда счёт Kaspi на номер не выставился (счёт по ссылке при этом действует). */
const KASPI_PUSH_ERRORS: Partial<Record<string, string>> = {
  kaspiUnavailable: "Kaspi не ответил",
  kaspiNotConnected: "кассир Kaspi не подключён",
  phoneInvalid: "номер чата не подходит для Kaspi",
  notPayable: "счёт уже не ждёт оплаты",
};

/** Счёт Kaspi на номер клиента; ошибка Kaspi не отменяет счёт — менеджер получает понятный текст. */
export async function pushKaspi(invoice: DealInvoice, phone: string): Promise<{ ok: true; org: string | null } | { ok: false; message: string }> {
  const ordering = container().ordering;
  try {
    await ordering.kaspi.pushDealInvoice(invoice.id, phone);
    return { ok: true, org: await ordering.kaspiRecipient() };
  } catch (err) {
    if (!OrderingError.is(err)) console.error("[invoices] kaspi push", err);
    const reason = (OrderingError.is(err) && KASPI_PUSH_ERRORS[err.code]) || "ошибка Kaspi";
    return { ok: false, message: `Счёт Kaspi на номер не выставлен (${reason}) — клиент может оплатить по ссылке` };
  }
}

/**
 * Счёт от имени бота (режим «Продаёт»): тот же выпуск, что «Счёт» в чате, — договорённость в сделку, ссылка /pay, счёт
 * Kaspi на номер WhatsApp-чата, после оплаты доступ уходит сам (invoice-access). Без сотрудника: цену задал владелец в
 * настройках бота, поэтому лимит скидки менеджера не применяется. Повтор того же хода (key) счёт не задваивает.
 */
export const botInvoices: BotInvoices = {
  async issue(input) {
    const methods = await availableMethods();
    if (!methods.kaspi && !methods.card && !methods.transfer) return { error: "нет способа оплаты" };
    const c = container();
    const conv = await c.messaging.queries.conversation(input.conversationId);
    if (!conv) return { error: "диалог не найден" };
    const phone = conv.channel === "whatsapp" && isPhoneLike(conv.chatId) ? normalizePhone(conv.chatId) : null;
    const source = sourceFromChannel(conv.channel);
    let invoice: DealInvoice;
    let repeated: boolean;
    try {
      ({ invoice, repeated } = await c.ordering.invoices.issue({
        dealId: input.dealId,
        conversationId: conv.id,
        phone,
        clientName: isPhoneLike(input.clientName) ? "" : input.clientName,
        locale: input.locale,
        channel: isManualChannel(source) ? source : "whatsapp",
        plan: input.plan,
        agreedTotal: input.agreedTotal,
        amount: input.amount,
        purpose: input.amount < input.agreedTotal ? "prepayment" : "full",
        actor: { userId: null, label: "бот" },
        maxDiscountPercent: null,
        issueKey: input.key,
      }));
    } catch (err) {
      if (OrderingError.is(err)) return { error: err.message };
      throw err;
    }
    if (repeated) return { error: "счёт этого хода уже выставлен" };
    const push = methods.kaspi && isKzMobile(phone) ? await pushKaspi(invoice, phone!) : null;
    return { label: invoice.label, amount: invoice.snapshot().amount, text: invoiceText(invoice, push?.ok ? { phone: phone!, org: push.org } : null) };
  },
};
