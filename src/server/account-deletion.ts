import "server-only";
/**
 * Удаление аккаунта клиентом (требование App Store и Google Play, решение владельца 25.11) — оркестрация контекстов.
 *
 * Сразу по запросу: профиль обезличен, вход закрыт на всех устройствах, push забыт, неоплаченные заказы отменены.
 * Остальное дочищает повторяемый проход purgeAccount — каждый контекст стирает своё (…Privacy в модулях):
 * - книги без заказов удаляются, книги доставленных и отменённых заказов — опустошаются (строка нужна заказу);
 * - заказ в работе (оплачен, не доставлен и не отменён) не трогаем: книга, файлы печати, адрес и телефон получателя
 *   нужны до доставки — после неё (или отмены) следующий проход дочистит и их и поставит purged_at;
 * - заказы и платежи остаются в учёте без контактов; сделка и карточка клиента — обезличены;
 * - наша копия переписки (WhatsApp, чат сайта, почта) с вложениями и записи звонков удаляются.
 * Проход идемпотентен: повтор после сбоя доделывает недоделанное. Журнал — без персональных данных (только id).
 */
import type { Locale } from "@/i18n/config";
import { accountDeletionFor } from "@/i18n/messages/account-deletion";
import { authoringPrivacy } from "@/modules/authoring";
import { feedbackPrivacy } from "@/modules/feedback";
import { clientsPrivacy } from "@/modules/clients";
import { identityPrivacy } from "@/modules/identity";
import { messagingPrivacy } from "@/modules/messaging";
import { notificationsPrivacy } from "@/modules/notifications";
import { orderingPrivacy, type ClientOrderRef } from "@/modules/ordering";
import { salesPrivacy } from "@/modules/sales";
import { telephonyPrivacy } from "@/modules/telephony";
import { workspacePrivacy } from "@/modules/workspace";
import { container } from "@/server/container";
import { whatsappMediaDir } from "@/server/whatsapp-media";

export interface DeletionPreview {
  /** Чем подтверждать: у клиентов вход только по паролю (ссылка доступа из чата тоже задаёт пароль). */
  confirm: "password";
  /** Что удалится — строки на языке пользователя. */
  items: string[];
  /** Что останется и до каких пор: учёт и заказы в работе. */
  kept: string[];
  /** Номера заказов в работе: их доставим, затем дочистим. */
  keptOrders: number[];
}

const inProgress = (orders: ClientOrderRef[]) => orders.filter((o) => orderingPrivacy.inProgress(o.status));

function preview(orders: ClientOrderRef[], locale: Locale): DeletionPreview {
  const t = accountDeletionFor(locale);
  const keptOrders = inProgress(orders)
    .map((o) => o.number)
    .sort((a, b) => a - b);
  return { confirm: "password", items: [...t.items], kept: [...keptOrders.map((n) => t.keptOrder.replace("{n}", String(n))), t.accounting], keptOrders };
}

/** Экран «Удалить аккаунт»: что удалится, что останется (заказы в работе). */
export async function deletionPreview(userId: string, locale: Locale): Promise<DeletionPreview> {
  return preview(await orderingPrivacy.ordersOf(userId), locale);
}

/**
 * Клиент удаляет аккаунт, подтвердив паролем. Неверный пароль — IdentityError("credentials"), сотрудник —
 * IdentityError("credentials") из домена (вызывающий слой проверяет роль раньше и показывает свой текст).
 * Дочистка — сразу, но её сбой не отменяет удаление: следующий проход планировщика доделает.
 */
export async function deleteClientAccount(userId: string, password: string, locale: Locale): Promise<DeletionPreview> {
  const c = container();
  await c.identity.accounts.deleteAccount(userId, password);
  await workspacePrivacy.forgetDevices(userId);
  const orders = await orderingPrivacy.ordersOf(userId);
  for (const o of orders.filter((x) => x.status === "pending_payment")) {
    await c.ordering.orders.cancelByCustomer(o.id, userId).catch((err) => console.error(`[account-deletion] cancel order ${o.id}`, err));
  }
  const after = await orderingPrivacy.ordersOf(userId);
  await c.access.audit.record({ actorId: null, action: "account.deleted", entity: "client", entityId: userId, details: { keptOrders: inProgress(after).length } });
  await purgeAccount(userId).catch((err) => console.error(`[account-deletion] purge ${userId}`, err));
  return preview(after, locale);
}

/** Один проход дочистки удалённого аккаунта. true — всё удалено (заказов в работе нет), отмечено purged_at. */
export async function purgeAccount(userId: string): Promise<boolean> {
  const orders = await orderingPrivacy.ordersOf(userId);
  const active = inProgress(orders);
  const activeBooks = new Set(active.map((o) => o.bookId));
  const orderedBooks = new Set(orders.map((o) => o.bookId));

  for (const bookId of await authoringPrivacy.booksOf(userId)) {
    if (activeBooks.has(bookId)) continue;
    if (orderedBooks.has(bookId)) await authoringPrivacy.emptyBook(bookId);
    else await authoringPrivacy.deleteBook(bookId);
  }
  for (const o of orders) if (!orderingPrivacy.inProgress(o.status)) await orderingPrivacy.anonymizeOrder(o.id);
  await orderingPrivacy.forgetBuyer(userId);
  await authoringPrivacy.forgetUser(userId);
  await feedbackPrivacy.forgetUser(userId);

  const deals = await salesPrivacy.dealsOf(userId);
  await salesPrivacy.anonymizeDeals(deals);
  await salesPrivacy.anonymizePayments(userId, deals);
  await clientsPrivacy.forgetClient(userId, deals);
  await messagingPrivacy.forgetClient(userId, whatsappMediaDir());
  await telephonyPrivacy.forgetClient(userId);
  await notificationsPrivacy.forgetUser(userId);
  await workspacePrivacy.forgetDevices(userId);

  if (active.length) return false;
  await identityPrivacy.markPurged(userId);
  await container().access.audit.record({ actorId: null, action: "account.purged", entity: "client", entityId: userId });
  return true;
}

/** Шаг планировщика: дочистить удалённые аккаунты (после доставки заказа в работе — и его). Возвращает, сколько дочищено. */
export async function purgeDeletedAccounts(): Promise<number> {
  let purged = 0;
  for (const id of await identityPrivacy.pendingPurge()) {
    try {
      if (await purgeAccount(id)) purged++;
    } catch (err) {
      console.error(`[account-deletion] purge ${id}`, err);
    }
  }
  return purged;
}
