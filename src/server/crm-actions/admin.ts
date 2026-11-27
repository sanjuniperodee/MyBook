import { z } from "zod";
import { uuid } from "@/server/input";
import { assertOrderVisible, assertStaff, assertVisible, audit, can, canSeeOrder, ForbiddenError, type Staff } from "@/server/access";
import { normalizePromoCode, OrderingError } from "@/modules/ordering";
import { ORDER_STATUSES as orderStatuses } from "@/shared/domain/orders";
import { ClientsError, type Actor as CrmActor } from "@/modules/clients";
import type { Actor } from "@/shared/application";
import { container } from "@/server/container";
import { staffActionError } from "@/server/errors";
import { admin } from "@/i18n/admin";
import { getPlan, type PlanId } from "@/config/site";
import { discountLimit } from "@/server/discount";
import { DiscountError, DiscountPolicy } from "@/shared/domain/discount";
import { REMINDER_COOLDOWN_DAYS, type ReminderResult } from "@/modules/notifications";

export interface AdminState {
  error?: string;
  ok?: string;
}

const actor = (email: string) => `admin:${email}`;

async function guardDeal(staff: Staff, dealId: string) {
  if (staff.scope === "all") return;
  assertVisible(staff, await container().clients.links.dealAssignee(dealId));
}

/** Клиент чужого менеджера для роли «только свои» недоступен и в действиях. */
async function guardClient(staff: Staff, clientId: string) {
  if (staff.scope === "all") return;
  assertVisible(staff, (await container().clients.clients.find(clientId))?.managerId);
}

/** Сотрудник глазами контекста «Клиенты CRM». */
const crmActor = (staff: Staff): CrmActor => ({ userId: staff.user.id, name: staff.user.name || staff.user.email, seesAll: staff.scope === "all", allTasks: can(staff, "tasks.all") });

/** Запрет из правил контекста — как ForbiddenError веб-слоя. */
async function clientsCommand<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (ClientsError.is(err) && err.code === "forbidden") throw new ForbiddenError();
    throw err;
  }
}

/** Подпись сотрудника в журналах заказа. */
const staffActor = (staff: Staff): Actor => ({ label: actor(staff.user.email), userId: staff.user.id });

/** Ошибку домена показываем сотруднику текстом, остальное — как есть. */
async function orderCommand(run: () => Promise<unknown>): Promise<AdminState | null> {
  try {
    await run();
    return null;
  } catch (err) {
    const error = staffActionError(err, OrderingError);
    if (error === null) throw err;
    return { error };
  }
}

export async function updateOrderAction(_: AdminState, form: FormData): Promise<AdminState> {
  const staff = await assertStaff("orders.edit");
  const parsed = z
    .object({
      orderId: z.string("Заказ не найден").uuid("Заказ не найден"),
      status: z.enum(orderStatuses, "Выберите статус заказа"),
      trackingNumber: z.string().trim().max(100, "Номер отслеживания — до 100 символов").optional(),
      note: z.string().trim().max(1000, "Заметка — до 1000 символов").optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { orderId, status, trackingNumber, note } = parsed.data;
  await assertOrderVisible(staff, orderId);
  const failed = await orderCommand(() => container().ordering.orders.update({ orderId, status, trackingNumber, note }, staffActor(staff)));
  if (failed) return failed;
  return { ok: "Сохранено" };
}

export async function saveAdminNoteAction(_: AdminState, form: FormData): Promise<AdminState> {
  const staff = await assertStaff("orders.edit");
  const orderId = uuid.parse(form.get("orderId"));
  await assertOrderVisible(staff, orderId);
  await container().ordering.orders.saveAdminNote(orderId, String(form.get("adminNote") ?? ""));
  return { ok: "Заметка сохранена" };
}

export async function generateFilesAction(orderId: string) {
  const staff = await assertStaff("orders.files");
  await assertOrderVisible(staff, uuid.parse(orderId));
  await container().ordering.orders.regeneratePrintFiles(uuid.parse(orderId), staffActor(staff));
}

/** Временно открыть книгу для правок клиентом (например, по просьбе исправить опечатку). */
export async function toggleBookLockAction(orderId: string) {
  const staff = await assertStaff("orders.edit");
  await assertOrderVisible(staff, uuid.parse(orderId));
  await container().ordering.orders.toggleBookEditing(uuid.parse(orderId), staffActor(staff));
}

export async function createPromoAction(_: AdminState, form: FormData): Promise<AdminState> {
  const staff = await assertStaff("promo.manage");
  const parsed = z
    .object({
      code: z.string().transform(normalizePromoCode).pipe(z.string().regex(/^[A-Z0-9_-]{3,40}$/, "Код: 3–40 символов, латиница, цифры, - и _")),
      kind: z.enum(["percent", "fixed"]),
      value: z.coerce.number().int().positive("Укажите размер скидки"),
      maxUses: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().positive().optional()),
      expiresAt: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.date().optional()),
      note: z.string().trim().max(200).optional(),
    })
    .refine((d) => d.kind !== "percent" || d.value <= 100, "Процент — не больше 100")
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const failed = await orderCommand(() => container().ordering.promos.create({ code: d.code, kind: d.kind, value: d.value, maxUses: d.maxUses ?? null, expiresOn: d.expiresAt ?? null, note: d.note ?? "" }));
  if (failed) return failed;
  await audit(staff, "promo.create", "promo", d.code, { kind: d.kind, value: d.value });
  return { ok: `Промокод ${d.code} создан` };
}

export async function togglePromoAction(id: string) {
  const staff = await assertStaff("promo.manage");
  const promo = await container().ordering.promos.toggle(uuid.parse(id));
  await audit(staff, promo.active ? "promo.enable" : "promo.disable", "promo", promo.code);
}

// ─── CRM: заказы ────────────────────────────────────────────────────────────

/** Перемещение карточки на канбан-доске. */
/** Перенос заказа на доске. Нарушение правила (неоплаченный — в печать) — текст ошибки, а не исключение. */
export async function moveOrderAction(orderId: string, status: string): Promise<AdminState> {
  const staff = await assertStaff("orders.edit");
  await assertOrderVisible(staff, uuid.parse(orderId));
  const failed = await orderCommand(() => container().ordering.orders.changeStatus({ orderId: uuid.parse(orderId), to: z.enum(orderStatuses).parse(status) }, staffActor(staff)));
  if (failed) return failed;
  return {};
}

/** Постоплата: неоплаченный заказ — в печать (договорились, что клиент заплатит после); причина обязательна. */
export async function startPostpayAction(orderId: string, reason: string): Promise<AdminState> {
  const staff = await assertStaff("orders.edit");
  const why = z.string().trim().min(3, "Укажите, о чём договорились с клиентом").max(200).safeParse(reason);
  if (!why.success) return { error: why.error.issues[0].message };
  const id = uuid.parse(orderId);
  await assertOrderVisible(staff, id);
  const failed = await orderCommand(() => container().ordering.payments.startPostpay(id, why.data, staffActor(staff)));
  if (failed) return failed;
  await audit(staff, "order.postpay", "order", id, { reason: why.data });
  return { ok: "Заказ в печати с постоплатой" };
}

/**
 * Руководитель сверил ручную оплату заказа с поступлением на счёт. Чужой заказ у роли «только свои» — как будто оплаты нет;
 * свою запись проверяет другой сотрудник (руководитель — может и свою).
 */
export async function reviewOrderPaymentAction(paymentId: string): Promise<AdminState> {
  const staff = await assertStaff("orders.edit", "team.manage");
  const found = await container().ordering.payments.find(uuid.parse(paymentId));
  if (!found || !(await canSeeOrder(staff, found.orderId))) return { error: "Оплата не найдена или уже проверена" };
  if (found.createdById === staff.user.id && !staff.context.isOwner) return { error: "Проверяет другой сотрудник — свою запись подтвердить нельзя" };
  const p = await container().ordering.payments.review(found.id, staff.user.id);
  if (!p) return { error: "Оплата не найдена или уже проверена" };
  await audit(staff, "order.payment_review", "order", p.orderId, { payment: p.id, amount: p.amount });
  return { ok: "Отмечено: проверено" };
}

/**
 * «Перевести в печатную»: оплаченную электронную версию — в печатный тариф (по умолчанию твёрдая обложка). Полученные деньги
 * засчитываются: хватает — заказ остаётся оплаченным и идёт в печать; нет — ждёт доплату. Права — orders.edit и заказ виден.
 */
export async function upgradeOrderToPrintedAction(orderId: string, plan: string): Promise<AdminState> {
  const staff = await assertStaff("orders.edit");
  const id = uuid.parse(orderId);
  const target = getPlan(plan);
  if (!target?.printed) return { error: "Выберите печатный тариф" };
  await assertOrderVisible(staff, id);
  let result: Awaited<ReturnType<ReturnType<typeof container>["ordering"]["orders"]["upgradeToPrinted"]>>;
  try {
    result = await container().ordering.orders.upgradeToPrinted({ orderId: id, plan: target.id }, staffActor(staff));
  } catch (err) {
    const error = staffActionError(err, OrderingError);
    if (error === null) throw err;
    return { error };
  }
  await audit(staff, "order.upgrade_printed", "order", id, { plan: target.id, due: result.due, credited: result.credited, outstanding: result.outstanding, overpaid: result.overpaid });
  const money = (n: number) => `${n.toLocaleString("ru-RU")} ₸`;
  return {
    ok: `Заказ переведён в печатную и оплачен${result.overpaid > 0 ? `, переплата ${money(result.overpaid)} — к возврату` : ""}`,
  };
}

/**
 * Массовая смена статуса. Пропущенные — по причинам: текст отказа домена («не оплачен — в печать только с постоплатой»,
 * «из этого статуса нельзя») → сколько заказов; чужие у роли «только свои» — «нет доступа».
 */
export async function bulkStatusAction(orderIds: string[], status: string): Promise<{ count: number; skipped: number; reasons: { reason: string; count: number }[] }> {
  const staff = await assertStaff("orders.edit");
  const s = z.enum(orderStatuses).parse(status);
  const ids = z.array(uuid).max(200).parse(orderIds);
  const reasons = new Map<string, number>();
  const skip = (reason: string) => reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  for (const id of ids) {
    // Роль «только свои» меняет только заказы своих клиентов — чужие пропускаются.
    if (!(await canSeeOrder(staff, id))) {
      skip("нет доступа");
      continue;
    }
    const failed = await orderCommand(() => container().ordering.orders.changeStatus({ orderId: id, to: s, note: "Массовое изменение" }, staffActor(staff)));
    if (failed) skip(failed.error ?? "не удалось");
  }
  const skipped = [...reasons.values()].reduce((a, b) => a + b, 0);
  await audit(staff, "order.bulk_status", "order", null, { count: ids.length - skipped, status: s });
  return { count: ids.length - skipped, skipped, reasons: [...reasons].map(([reason, count]) => ({ reason, count })) };
}

/** Ответственный за заказ. Отказ (чужой заказ, сотрудник отключён) — текстом для тоста, а не исключением. */
export async function assignOrderAction(orderId: string, assigneeId: string | null): Promise<AdminState> {
  const staff = await assertStaff("orders.edit");
  const id = uuid.parse(orderId);
  if (!(await canSeeOrder(staff, id))) return { error: new ForbiddenError().message };
  const failed = await orderCommand(() => container().ordering.orders.assign(id, assigneeId ? uuid.parse(assigneeId) : null, staffActor(staff)));
  if (failed) return failed;
  return { ok: "Сохранено" };
}

export async function updateOrderDetailsAction(_: AdminState, form: FormData): Promise<AdminState> {
  const staff = await assertStaff("orders.edit");
  const parsed = z
    .object({
      orderId: uuid,
      contactName: z.string().trim().min(1, "Укажите имя").max(100),
      contactPhone: z.string().trim().min(5, "Укажите телефон").max(30),
      contactEmail: z.string().trim().toLowerCase().email("Проверьте e-mail"),
      deliveryMethod: z.enum(["pickup", "courier", "post", "abroad"]).or(z.literal("")).optional(),
      country: z.string().trim().max(60).optional(),
      city: z.string().trim().max(100).optional(),
      address: z.string().trim().max(300).optional(),
      postalCode: z.string().trim().max(20).optional(),
      desiredDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
      giftNote: z.string().trim().max(500).optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { orderId, ...d } = parsed.data;
  await assertOrderVisible(staff, orderId);
  const failed = await orderCommand(() =>
    container().ordering.orders.updateDetails(
      {
        orderId,
        contact: { name: d.contactName, phone: d.contactPhone, email: d.contactEmail },
        delivery: { method: d.deliveryMethod || null, country: d.country || null, city: d.city || null, address: d.address || null, postalCode: d.postalCode || null },
        desiredDate: d.desiredDate || null,
        giftNote: d.giftNote || null,
      },
      staffActor(staff),
    ),
  );
  if (failed) return failed;
  return { ok: "Сохранено" };
}

/**
 * Тариф и договорённая цена книги неоплаченного заказа. Пустая цена — по прайсу тарифа; ниже прайса сверх лимита скидки
 * сотрудника — отказ (как у бюджета сделки и счёта из чата).
 */
/**
 * «Тариф и цена» заказа. Неоплаченный — менеджер (orders.edit) в пределах своего лимита скидки. Оплаченный — только
 * сотрудник с правом «Менять цену оплаченного заказа» и только цену, с причиной: полученное больше новой суммы — переплата
 * (задача «возврат или зачёт»), меньше — заказ снова ждёт доплату остатка (Order.changeTerms). Всё — в журнал заказа и
 * журнал действий; сумма сделки следует за заказом (подписка на order_repriced).
 */
export async function changeOrderTermsAction(_: AdminState, form: FormData): Promise<AdminState> {
  const staff = await assertStaff("orders.edit");
  const parsed = z
    .object({
      orderId: uuid,
      plan: z.string().refine((p) => !!getPlan(p), "Выберите тариф из списка"),
      agreedTotal: z.union([z.literal(""), z.coerce.number("Сумма — число").int("Сумма — целое число тенге").min(1, "Сумма — больше нуля").max(100_000_000, "Слишком большая сумма")]).optional(),
      reason: z.string().trim().max(500, "Причина — до 500 знаков").optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { orderId, plan } = parsed.data;
  const agreedTotal = parsed.data.agreedTotal === "" || parsed.data.agreedTotal === undefined ? null : parsed.data.agreedTotal;
  await assertOrderVisible(staff, orderId);
  const limit = await discountLimit(staff);
  let percent = 0;
  const list = getPlan(plan)!.price;
  if (agreedTotal !== null) {
    try {
      percent = DiscountPolicy.check({ listPrice: list, price: agreedTotal, maxPercent: limit });
    } catch (err) {
      const message = staffActionError(err, DiscountError);
      if (message) return { error: message };
      throw err;
    }
  }
  // Оплаченный заказ домен меняет только с settled (и требует причину); без права — отказ «попросите руководителя».
  const settled = can(staff, "orders.reprice_paid") ? { reason: parsed.data.reason ?? "" } : null;
  let result: Awaited<ReturnType<ReturnType<typeof container>["ordering"]["orders"]["changeTerms"]>>;
  try {
    result = await container().ordering.orders.changeTerms({ orderId, plan: plan as PlanId, agreedTotal, settled }, staffActor(staff));
  } catch (err) {
    const error = staffActionError(err, OrderingError);
    if (error === null) throw err;
    return { error };
  }
  await audit(staff, result.wasPaid ? "order.reprice_paid" : "order.terms", "order", orderId, {
    plan,
    agreedTotal,
    listPrice: list,
    percent,
    previousAmount: result.previousAmount,
    amount: result.amount,
    received: result.received,
    ...(result.wasPaid && parsed.data.reason ? { reason: parsed.data.reason } : {}),
    ...(result.overpaid ? { overpaid: result.overpaid } : {}),
    ...(result.reopened ? { reopened: true, outstanding: result.outstanding } : {}),
  });
  const money = (n: number) => `${n.toLocaleString("ru-RU")} ₸`;
  const tail = result.reopened
    ? ` Денег не хватает: заказ ждёт доплату ${money(result.outstanding)}.`
    : result.overpaid > 0 && result.previousAmount > result.amount
      ? ` Получено больше на ${money(result.overpaid)} — ответственному поставлена задача «возврат или зачёт».`
      : "";
  return { ok: `Сохранено: к оплате ${money(result.previousAmount)} → ${money(result.amount)}.${tail}` };
}

/**
 * Менеджер без права менять цену оплаченного заказа просит руководителя: заметка в журнале заказа и уведомление всем с
 * правом «Менять цену оплаченного заказа» (ссылка на заказ). Цена не меняется, пока руководитель не сохранит её сам.
 */
export async function requestOrderRepriceAction(orderId: string, price: string, reason: string): Promise<AdminState> {
  const staff = await assertStaff("orders.edit");
  const parsed = z
    .object({
      id: uuid,
      price: z.coerce.number("Сумма — число").int("Сумма — целое число тенге").min(1, "Укажите договорённую цену").max(100_000_000, "Слишком большая сумма"),
      reason: z.string().trim().min(3, "Укажите, о чём договорились с клиентом").max(500),
    })
    .safeParse({ id: orderId, price, reason });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id } = parsed.data;
  await assertOrderVisible(staff, id);
  const order = await container().ordering.orders.addNote(id, `Просьба руководителю: изменить договорённую цену книги на ${parsed.data.price.toLocaleString("ru-RU")} ₸. ${parsed.data.reason}`, staffActor(staff));
  const { staffNotifier } = await import("@/modules/workspace");
  await staffNotifier.notifyAllWith("orders.reprice_paid", {
    kind: "system",
    title: `Заказ №${order.number}: просят изменить цену на ${parsed.data.price.toLocaleString("ru-RU")} ₸`,
    body: `${staff.user.name || staff.user.email}: ${parsed.data.reason}`,
    link: `/admin/orders/${id}#money`,
  });
  await audit(staff, "order.reprice_request", "order", id, { price: parsed.data.price, reason: parsed.data.reason });
  return { ok: "Руководитель получил уведомление со ссылкой на заказ" };
}

/**
 * Руководитель отменяет ошибочный ручной платёж (фиктивная «доплата», не тот заказ): платёж остаётся в журнале с пометкой
 * «отменён» и причиной, из «получено», финансов, выручки и комиссий уходит; заказ при нехватке снова ждёт оплату.
 * Подтверждённый (проверенный) — тоже можно: интерфейс предупреждает, в журнал — что был проверен.
 */
export async function voidOrderPaymentAction(paymentId: string, reason: string): Promise<AdminState> {
  const staff = await assertStaff("orders.edit", "orders.payment_void");
  const why = z.string().trim().min(3, "Укажите причину отмены платежа").max(500).safeParse(reason);
  if (!why.success) return { error: why.error.issues[0].message };
  const found = await container().ordering.payments.find(uuid.parse(paymentId));
  if (!found || !(await canSeeOrder(staff, found.orderId))) return { error: "Платёж не найден" };
  let result: Awaited<ReturnType<ReturnType<typeof container>["ordering"]["payments"]["voidPayment"]>>;
  try {
    result = await container().ordering.payments.voidPayment({ paymentId: found.id, reason: why.data, actor: { label: staffActor(staff).label, userId: staff.user.id } });
  } catch (err) {
    const error = staffActionError(err, OrderingError);
    if (error === null) throw err;
    return { error };
  }
  await audit(staff, "order.payment_void", "order", found.orderId, { payment: found.id, kind: found.kind, amount: found.amount, reason: why.data, reviewed: !!found.reviewedAt, received: result.received, ...(result.reopened ? { reopened: true } : {}) });
  return { ok: result.reopened ? `Платёж отменён. Денег не хватает — заказ ждёт ${result.outstanding.toLocaleString("ru-RU")} ₸` : "Платёж отменён" };
}

// ─── CRM: задачи и заметки ─────────────────────────────────────────────────


export async function createTaskAction(_: AdminState, form: FormData): Promise<AdminState> {
  const staff = await assertStaff();
  const opt = (v: FormDataEntryValue | null) => (v ? String(v) : undefined);
  const parsed = z
    .object({
      title: z.string().trim().min(2, "Опишите задачу").max(300),
      dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/).optional(),
      remindBeforeMin: z.union([z.literal("none").transform(() => null), z.coerce.number().int().min(0).max(10_080)]).optional(),
      clientId: uuid.optional(),
      orderId: uuid.optional(),
      dealId: uuid.optional(),
      assigneeId: uuid.optional(),
      kind: z.enum(["task", "call", "message", "meeting"]).default("task"),
    })
    .safeParse({
      title: form.get("title"),
      // Дата и необязательное время («17:30»): без времени срок — до конца рабочего дня.
      dueAt: opt(form.get("dueAt")) && opt(form.get("dueTime")) ? `${opt(form.get("dueAt"))}T${opt(form.get("dueTime"))}` : opt(form.get("dueAt")),
      remindBeforeMin: opt(form.get("remindBeforeMin")),
      clientId: opt(form.get("clientId")),
      orderId: opt(form.get("orderId")),
      dealId: opt(form.get("dealId")),
      assigneeId: opt(form.get("assigneeId")),
      kind: opt(form.get("kind")),
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  // Задача на чужую сделку или клиента у роли «только свои» — как у заметки: как будто их нет.
  try {
    if (d.clientId) await guardClient(staff, d.clientId);
    if (d.dealId) await guardDeal(staff, d.dealId);
    if (d.orderId) await assertOrderVisible(staff, d.orderId);
  } catch (err) {
    if (ForbiddenError.is(err)) return { error: err.message };
    throw err;
  }
  try {
    await clientsCommand(() => container().clients.tasks.create(crmActor(staff), d));
  } catch (err) {
    // Исполнитель отключён или не сотрудник — текстом в форме, как другие ошибки (B12).
    if (ClientsError.is(err) && err.code === "staffNotFound") return { error: err.message };
    throw err;
  }
  return { ok: "Задача добавлена" };
}

/** Отметка «выполнено» по чекбоксу. Чужая задача — текстом (как у правки), а не исключением. */
export async function toggleTaskAction(taskId: string): Promise<{ error?: string }> {
  const staff = await assertStaff();
  try {
    await container().clients.tasks.toggle(crmActor(staff), uuid.parse(taskId));
    return {};
  } catch (err) {
    if (ClientsError.is(err)) return { error: err.code === "forbidden" ? admin.taskForbidden : err.message };
    throw err;
  }
}

/**
 * «Что сделали?» (tasks-1): выполнить задачу с итогом и следующим шагом. Итог — в задачу и заметкой в ленту сделки или
 * клиента; следующий шаг — новая задача на того же клиента и сделку, на себя.
 */
export async function completeTaskAction(taskId: string, raw: { result?: string; nextTitle?: string; nextDue?: string }): Promise<{ error?: string }> {
  const staff = await assertStaff();
  const d = z
    .object({
      result: z.string().trim().max(500).optional(),
      nextTitle: z.string().trim().max(300).optional(),
      nextDue: z.string().trim().max(20).optional(),
    })
    .parse(raw);
  const actor = crmActor(staff);
  const { task: t, completed } = await clientsCommand(() => container().clients.tasks.complete(actor, uuid.parse(taskId), d.result ?? null));
  if (completed && d.result && (t.dealId || t.clientId))
    await container().clients.notes.add(actor, { kind: "note", text: `Задача «${t.title}» выполнена: ${d.result}`, dealId: t.dealId ?? undefined, clientId: t.clientId ?? undefined, orderId: t.orderId ?? undefined });
  if (completed && d.nextTitle && d.nextTitle.length >= 2)
    await clientsCommand(() =>
      container().clients.tasks.create(actor, { title: d.nextTitle!, kind: t.kind, dueAt: d.nextDue || undefined, clientId: t.clientId ?? undefined, dealId: t.dealId ?? undefined, orderId: t.orderId ?? undefined }),
    );
  return {};
}

/**
 * Правка задачи со страницы «Задачи» (поле за полем): заголовок, тип, срок («ГГГГ-ММ-ДД» или с временем; "" — без срока),
 * напоминание, ответственный, результат. Ошибка — текстом для строки задачи.
 */
export async function updateTaskAction(taskId: string, raw: { title?: string; kind?: string; dueAt?: string | null; remindBeforeMin?: string | null; assigneeId?: string; result?: string }): Promise<{ error?: string }> {
  const staff = await assertStaff();
  const parsed = z
    .object({
      title: z.string().trim().min(2, "Опишите задачу").max(300).optional(),
      kind: z.enum(["task", "call", "message", "meeting"]).optional(),
      dueAt: z
        .union([z.literal("").transform(() => null), z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, "Неверный срок")])
        .nullable()
        .optional(),
      remindBeforeMin: z.union([z.literal("none").transform(() => null), z.coerce.number().int().min(0).max(10_080)]).nullable().optional(),
      assigneeId: uuid.optional(),
      result: z.string().max(1000).optional(),
    })
    .safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await container().clients.tasks.update(crmActor(staff), uuid.parse(taskId), parsed.data);
    return {};
  } catch (err) {
    if (ClientsError.is(err)) return { error: err.code === "forbidden" ? admin.taskForbidden : err.message };
    throw err;
  }
}

/** Отложить задачу одной кнопкой из «Моего дня» и «Задач»: «+1 ч» или «Завтра» (срок считает сервер). */
export async function snoozeTaskAction(taskId: string, by: string): Promise<{ error?: string }> {
  const staff = await assertStaff();
  const how = z.enum(["hour", "tomorrow"]).safeParse(by);
  if (!how.success) return { error: admin.badForm };
  try {
    await container().clients.tasks.snooze(crmActor(staff), uuid.parse(taskId), how.data);
    return {};
  } catch (err) {
    if (ClientsError.is(err)) return { error: err.code === "forbidden" ? admin.taskForbidden : err.message };
    throw err;
  }
}

export async function deleteTaskAction(taskId: string): Promise<{ error?: string }> {
  const staff = await assertStaff();
  try {
    await container().clients.tasks.delete(crmActor(staff), uuid.parse(taskId));
    return {};
  } catch (err) {
    if (ClientsError.is(err)) return { error: err.code === "forbidden" ? admin.taskForbidden : err.message };
    throw err;
  }
}

export async function addNoteAction(_: AdminState, form: FormData): Promise<AdminState> {
  const dealOnly = !form.get("clientId") && !!form.get("dealId");
  // Заметка в сделке — право на сделки; в карточке клиента — на клиентов.
  const staff = await assertStaff(form.get("dealId") ? "deals.edit" : "clients.edit");
  const parsed = z
    .object({
      clientId: dealOnly ? z.undefined() : uuid,
      orderId: uuid.optional(),
      dealId: uuid.optional(),
      kind: z.enum(["note", "call", "message", "email"]).default("note"),
      text: z.string().trim().min(1, "Пустая заметка").max(5000),
    })
    .safeParse({ clientId: form.get("clientId") || undefined, orderId: form.get("orderId") || undefined, dealId: form.get("dealId") || undefined, kind: form.get("kind") || undefined, text: form.get("text") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.clientId) await guardClient(staff, parsed.data.clientId);
  if (parsed.data.dealId) await guardDeal(staff, parsed.data.dealId);
  if (parsed.data.orderId) await assertOrderVisible(staff, parsed.data.orderId);
  await container().clients.notes.add(crmActor(staff), parsed.data);
  return { ok: "Заметка сохранена" };
}

export async function deleteNoteAction(noteId: string) {
  const staff = await assertStaff();
  const note = await container().clients.notes.find(uuid.parse(noteId));
  if (!note) return;
  if (!can(staff, "clients.edit") && !(note.dealId && can(staff, "deals.edit"))) throw new ForbiddenError();
  if (note.clientId) await guardClient(staff, note.clientId);
  if (note.dealId) await guardDeal(staff, note.dealId);
  // Системные записи (звонки, смены этапов) — часть истории, их не удаляем.
  const n = await clientsCommand(() => container().clients.notes.delete(note.id));
  if (n) await audit(staff, "note.delete", "client", n.clientId, { text: n.text.slice(0, 200) });
}

// ─── CRM: клиенты ───────────────────────────────────────────────────────────

export async function updateClientTagsAction(clientId: string, tags: string[]) {
  const staff = await assertStaff("clients.edit");
  const id = uuid.parse(clientId);
  await guardClient(staff, id);
  const clean = await container().clients.clients.setTags(id, z.array(z.string().trim().toLowerCase().min(1).max(30)).max(20).parse(tags));
  await audit(staff, "client.tags", "client", clientId, { tags: clean });
}

const reminderRefusal: Record<Exclude<ReminderResult, { ok: true }>["reason"], string> = {
  clientNotFound: "Клиент не найден",
  cooldown: `Напоминание уже отправлялось менее ${REMINDER_COOLDOWN_DAYS} дней назад`,
  noDraft: "У клиента нет незавершённых книг",
  noEmail: "У клиента нет почты — напишите ему в WhatsApp",
  optedOut: "Клиент отписался от писем",
  mailOff: "Почта не настроена («Интеграции» → «Почта») — письмо не ушло",
  mailFailed: "Почтовый сервер не принял письмо — попробуйте позже",
};

export async function remindClientAction(clientId: string): Promise<{ ok: boolean; message: string }> {
  const staff = await assertStaff("clients.edit");
  const admin = staff.user;
  await guardClient(staff, uuid.parse(clientId));
  const res = await container().notifications.reminders.send(uuid.parse(clientId), admin.id);
  return res.ok ? { ok: true, message: "Напоминание отправлено" } : { ok: false, message: reminderRefusal[res.reason] };
}

export async function remindManyAction(clientIds: string[]): Promise<{ sent: number; skipped: number }> {
  const staff = await assertStaff("clients.edit");
  const admin = staff.user;
  let sent = 0;
  let skipped = 0;
  for (const id of z.array(uuid).max(300).parse(clientIds)) {
    await guardClient(staff, id);
    const res = await container().notifications.reminders.send(id, admin.id);
    if (res.ok) sent++;
    else skipped++;
  }
  return { sent, skipped };
}


