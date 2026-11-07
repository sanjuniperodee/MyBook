"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuid } from "@/server/input";
import { assertStaff, assertVisible, audit, can, canWork, type Staff } from "@/server/access";
import { container } from "@/server/container";
import { storeTimeZone } from "@/shared/domain/time";
import { financePeriod, financeScreen } from "@/modules/reporting/ui/finance-screen";

export interface FinanceState {
  ok?: string;
  error?: string;
}

/**
 * «Проверено»: руководитель сверил ручной платёж или возврат сделки (перевод с чеком) с поступлением на счёт. Только
 * team.manage; роль «только свои» — по своим сделкам; свою запись — нельзя. Онлайн-платёж и уже проверенный не отмечаются.
 */
export async function reviewDealPaymentAction(paymentId: string): Promise<FinanceState> {
  const staff = await assertStaff("team.manage");
  const id = uuid.parse(paymentId);
  const sales = container().sales;
  const payment = await sales.payments.find(id);
  if (!payment) return { error: "Платёж не найден" };
  if (staff.scope !== "all") assertVisible(staff, (await sales.deals.findById(payment.dealId))?.assigneeId);
  // Сверка — второй парой глаз: свою запись денег (или возврата) сотрудник не подтверждает. Владелец — может: проверять его некому.
  if (payment.createdById === staff.user.id && !staff.context.isOwner) return { error: "Проверяет другой сотрудник — свою запись подтвердить нельзя" };
  const p = await sales.payments.review(id, staff.user.id);
  if (!p) return { error: "Платёж не найден, онлайн или уже проверен" };
  await audit(staff, "payment.review", "deal", p.dealId, { payment: p.id, amount: p.amount, kind: p.kind });
  revalidatePath("/admin/finance");
  revalidatePath(`/admin/deals/${p.dealId}`);
  return { ok: "Отмечено: проверено" };
}

/** Ключ случая очереди «Нужно вернуть или зачесть»: вид (сделка, заказ, оплата Kaspi) и id записи. */
const issueKey = z.string().regex(/^(dc|dl|da|do|oo|oc|un):[0-9a-f-]{36}$/i, "Случай не найден");
const comment = z.string().trim().min(3, "Напишите, как решили: от 3 символов").max(500, "Комментарий — до 500 символов");

/** Сделка, заказ или оплата Kaspi вне учёта — по префиксу ключа (для права и журнала действий). */
const issueEntity = (key: string) => (key.startsWith("un:") ? "payment_invoice" : key.startsWith("o") ? "order" : "deal");

/** Право решать случай — как у «Проверено» в очереди: руководитель (team.manage); случай заказа — ещё и orders.edit (как сверка оплаты заказа). */
const canResolve = (staff: Staff, key: string) => (issueEntity(key) === "order" ? can(staff, "team.manage", "orders.edit") : can(staff, "team.manage"));

/**
 * «Отметить решённым»: случай «Нужно вернуть или зачесть» закрыт без денег через CRM (вернули часть, зачли в другой заказ,
 * договорились с клиентом) — комментарий обязателен. Случай ищем в текущих данных: его нет или сумма уже другая — отказ
 * (обновите страницу). Решение действует для этой суммы: изменится — случай вернётся в очередь.
 */
export async function resolveFinanceIssueAction(key: string, amount: number, note: string): Promise<FinanceState> {
  const staff = await assertStaff("analytics.view");
  const k = issueKey.safeParse(key);
  if (!k.success) return { error: "Случай не найден" };
  if (!canResolve(staff, k.data)) return { error: "Отмечать решённым может руководитель" };
  const text = comment.safeParse(note);
  if (!text.success) return { error: text.error.issues[0].message };
  const sum = z.number().int().positive().safeParse(amount);
  if (!sum.success) return { error: "Сумма случая не совпала — обновите страницу" };

  const c = container();
  const tz = storeTimeZone();
  const now = new Date();
  // Те же правила, что на странице: случай виден сотруднику и сейчас в очереди с этой суммой.
  const data = await c.reporting.financeIssues();
  const screen = financeScreen({ period: financePeriod({ now, tz }), money: [], review: [], ...data, staff: [], visible: (id) => canWork(staff, id), tz, now });
  const issue = screen.issues.find((i) => i.key === k.data);
  if (!issue) return { error: "Случай уже закрыт или недоступен — обновите страницу" };
  if (issue.amount !== sum.data) return { error: "Сумма случая изменилась — обновите страницу" };

  const saved = await c.workspace.financeResolutions.resolve({
    key: issue.key,
    amount: issue.amount,
    note: text.data,
    title: issue.title,
    ref: issue.ref,
    client: issue.client,
    href: issue.href,
    managerId: issue.managerId,
    resolvedById: staff.user.id,
  });
  if (!saved) return { error: "Случай уже отмечен решённым" };
  await audit(staff, "finance.issue_resolve", issueEntity(issue.key), issue.key.slice(3), { resolution: saved.id, key: issue.key, kind: issue.kind, amount: issue.amount, note: text.data });
  revalidatePath("/admin/finance");
  return { ok: "Отмечено решённым" };
}

/** «Отменить решение»: случай снова в очереди (если деньги по нему всё ещё не сходятся). Право — как у «Отметить решённым». */
export async function undoFinanceResolutionAction(resolutionId: string): Promise<FinanceState> {
  const staff = await assertStaff("analytics.view");
  const id = uuid.safeParse(resolutionId);
  if (!id.success) return { error: "Решение не найдено" };
  const store = container().workspace.financeResolutions;
  const found = await store.find(id.data);
  if (!found || !canWork(staff, found.managerId)) return { error: "Решение не найдено или уже отменено" };
  if (!canResolve(staff, found.key)) return { error: "Отменять решение может руководитель" };
  const undone = await store.undo(found.id, staff.user.id, new Date());
  if (!undone) return { error: "Решение уже отменено" };
  await audit(staff, "finance.issue_unresolve", issueEntity(found.key), found.key.slice(3), { resolution: found.id, key: found.key, amount: found.amount });
  revalidatePath("/admin/finance");
  return { ok: "Решение отменено" };
}
