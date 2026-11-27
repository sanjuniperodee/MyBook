import "server-only";
import { container } from "@/server/container";
import { layoutApprovalState, layoutBlock, OrderingError, type CurrentLayout, type LayoutApproval, type LayoutApprovalState, type OrderDetailsView } from "@/modules/ordering";
import { PrintLayoutChangedError, type PrintJob } from "@/modules/production";
import { errorText } from "@/i18n/api-errors";
import { isLocale, type Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { env } from "@/config/env";

/**
 * Согласование макета клиентом на краю: строка заказа → согласие, книга сейчас, вид для экранов и подготовка пакета для
 * типографии из согласованной версии. Один код для mybook-api и бэкенда на Nest (через legacy-порты): файлы заказа,
 * ZIP-пакет, карточка заказа CRM и API v1 (crmOrderFiles), кабинет клиента.
 */

type OrderRow = Pick<OrderDetailsView, "id" | "bookId" | "number" | "plan" | "quantity" | "layoutApprovalRequired" | "layoutApprovedAt" | "layoutApprovedFingerprint" | "layoutApprovalRevokedAt">;

export function approvalOf(o: Pick<OrderRow, "layoutApprovalRequired" | "layoutApprovedAt" | "layoutApprovedFingerprint" | "layoutApprovalRevokedAt">): LayoutApproval {
  return { required: o.layoutApprovalRequired, approvedAt: o.layoutApprovedAt, fingerprint: o.layoutApprovedFingerprint, revokedAt: o.layoutApprovalRevokedAt };
}

/** Книга заказа сейчас — только если заказу нужно согласование (иначе не считаем: старым заказам всё как раньше). */
export async function currentLayoutOf(o: OrderRow): Promise<CurrentLayout | null> {
  return o.layoutApprovalRequired ? container().ordering.orders.currentLayout(o.bookId) : null;
}

/** Согласие и книга сейчас: что мешает печатным файлам (null — можно). */
export async function orderLayout(o: OrderRow): Promise<{ approval: LayoutApproval; current: CurrentLayout | null }> {
  return { approval: approvalOf(o), current: await currentLayoutOf(o) };
}

/** Вид согласования для экранов (кабинет, CRM, приложение): состояние, повторное ли, когда согласовано. */
export interface LayoutApprovalView {
  state: LayoutApprovalState;
  again: boolean;
  approvedAt: string | null;
}

export function layoutView(approval: LayoutApproval, current: CurrentLayout | null): LayoutApprovalView {
  const { state, again } = layoutApprovalState(approval, current);
  return { state, again, approvedAt: approval.approvedAt ? approval.approvedAt.toISOString() : null };
}

/** Что видит сотрудник: состояние, текст отказа печатных файлов (null — можно) и ссылка на заказ в кабинете клиента. */
export interface StaffLayoutView extends LayoutApprovalView {
  blocked: string | null;
  clientUrl: string;
}

const LOCALE_PREFIX: Record<Locale, string> = { ru: "", kk: "/kk", uz: "/uz", en: "/en" };

/** Страница заказа в кабинете клиента на его языке — сотрудник копирует и отправляет сам (рассылки выключены). */
export function clientOrderUrl(o: { id: string; user?: { locale?: string | null } | null }) {
  const locale = isLocale(o.user?.locale) ? o.user.locale : "ru";
  return `${env.appUrl}${LOCALE_PREFIX[locale]}/orders/${o.id}`;
}

export async function staffLayoutView(o: OrderRow & { user?: { locale?: string | null } | null }): Promise<StaffLayoutView> {
  const { approval, current } = await orderLayout(o);
  const block = layoutBlock(approval, current);
  return { ...layoutView(approval, current), blocked: block ? errorText(messagesFor("ru").api, block) : null, clientUrl: clientOrderUrl(o) };
}

export const printJob = (o: OrderRow): PrintJob => ({ orderId: o.id, bookId: o.bookId, number: o.number, plan: o.plan, quantity: o.quantity });

/**
 * Пакет для типографии к выдаче: макет согласован и книга та же (иначе OrderingError с кодом отказа — 403/409 в обоих
 * процессах), пакет — из согласованной версии: собран из другой (до правок, при оплате) — пересобирается. Параметры
 * пересобранного пакета — в заказ. Заказ без согласования (электронный, старый) — как раньше, из кэша.
 */
export async function preparePrintPackage(o: OrderRow, opts: { force?: boolean } = {}): Promise<{ job: PrintJob; fingerprint?: string }> {
  const { approval, current } = await orderLayout(o);
  const block = layoutBlock(approval, current);
  if (block) throw new OrderingError(block);
  const job = printJob(o);
  const fingerprint = approval.required ? (approval.fingerprint ?? undefined) : undefined;
  try {
    const spec = await container().printFiles.prepare(job, { force: opts.force, fingerprint });
    if (spec) await container().ordering.orders.recordPrintSpec(o.id, spec);
  } catch (err) {
    // Книгу изменили, пока пакет ждал сборки: собранный — не согласованная версия, его не выдаём.
    if (PrintLayoutChangedError.is(err)) throw new OrderingError("layoutChanged");
    throw err;
  }
  return { job, fingerprint };
}
