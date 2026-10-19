import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { books, crmCalls, crmDeals, crmNotes, crmTasks, orders, users } from "@/shared/infrastructure/db/schema";
import { staffLabel } from "@/shared/domain/staff";
import { executor } from "@/shared/infrastructure/database";
import { usersId } from "@/shared/infrastructure/db/refs";
import type { AccountUsage, ClientRepository, CrmLinks, NoteRepository, StaffDirectory, TaskRepository } from "../application";

export const drizzleClients: ClientRepository = {
  async find(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [u] = await executor().select({ id: users.id, name: users.name, email: users.email, phone: users.phone, managerId: users.managerId, source: users.source, customFields: users.customFields }).from(users).where(eq(users.id, id)).limit(1);
    return u ?? null;
  },
  setManager: async (id, managerId) => void (await executor().update(users).set({ managerId }).where(eq(users.id, id))),
  setExtraPhones: async (id, phones) => void (await executor().update(users).set({ extraPhones: phones }).where(eq(users.id, id))),
  setCustomFields: async (id, values) => void (await executor().update(users).set({ customFields: values }).where(eq(users.id, id))),
  setTags: async (id, tags) => void (await executor().update(users).set({ tags }).where(eq(users.id, id))),
  setSource: async (id, source) => void (await executor().update(users).set({ source }).where(eq(users.id, id))),
};

export const drizzleTasks: TaskRepository = {
  async find(id) {
    const [t] = await executor().select().from(crmTasks).where(eq(crmTasks.id, id)).limit(1);
    return t ?? null;
  },
  add: async (t) => void (await executor().insert(crmTasks).values(t)),
  async existsOpen({ dealId, title }) {
    const [t] = await executor().select({ id: crmTasks.id }).from(crmTasks).where(and(eq(crmTasks.dealId, dealId), eq(crmTasks.title, title), isNull(crmTasks.doneAt))).limit(1);
    return !!t;
  },
  async closeOpenByPrefix({ dealId, prefix, keepTitle, at }) {
    const rows = await executor()
      .update(crmTasks)
      .set({ doneAt: at })
      .where(and(eq(crmTasks.dealId, dealId), isNull(crmTasks.doneAt), sql`starts_with(${crmTasks.title}, ${prefix})`, keepTitle ? ne(crmTasks.title, keepTitle) : undefined))
      .returning({ id: crmTasks.id });
    return rows.length;
  },
  async claimDueReminders(now, staleMin, limit) {
    const db = executor();
    // Открытые задачи со сроком — по индексу crm_tasks_due_idx (done_at, due_at): срок не дальше недели вперёд (раньше
    // напомнить нельзя — предел remindBeforeMin) и не старше staleMin; ничьи — тоже. Ранние сроки первыми, не больше limit.
    const due = db
      .select({ id: crmTasks.id })
      .from(crmTasks)
      .where(
        and(
          isNull(crmTasks.doneAt),
          isNull(crmTasks.remindedAt),
          isNotNull(crmTasks.remindBeforeMin),
          sql`${crmTasks.dueAt} <= ${now}::timestamptz + interval '7 days'`,
          sql`${crmTasks.dueAt} > ${now}::timestamptz - ${staleMin} * interval '1 minute'`,
          sql`${crmTasks.dueAt} - ${crmTasks.remindBeforeMin} * interval '1 minute' <= ${now}`,
        ),
      )
      .orderBy(asc(crmTasks.dueAt))
      .limit(limit);
    const rows = await db
      .update(crmTasks)
      .set({ remindedAt: now })
      .where(and(inArray(crmTasks.id, due), isNull(crmTasks.remindedAt), isNull(crmTasks.doneAt)))
      .returning({ id: crmTasks.id, title: crmTasks.title, kind: crmTasks.kind, dueAt: crmTasks.dueAt, assigneeId: crmTasks.assigneeId, dealId: crmTasks.dealId, orderId: crmTasks.orderId });
    return rows.map((r) => ({ ...r, dueAt: r.dueAt as Date })).sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  },
  setDone: async (id, doneAt) => void (await executor().update(crmTasks).set({ doneAt }).where(eq(crmTasks.id, id))),
  // Один UPDATE на ответ клиенту — по частичному индексу crm_tasks_open_deal_idx (открытые задачи сделки).
  async closeOpenOfKind({ dealId, kind, result, at }) {
    const rows = await executor()
      .update(crmTasks)
      .set({ doneAt: at, result: sql`coalesce(${crmTasks.result}, ${result})` })
      .where(and(eq(crmTasks.dealId, dealId), isNull(crmTasks.doneAt), eq(crmTasks.kind, kind)))
      .returning({ id: crmTasks.id });
    return rows.length;
  },
  // По частичному индексу crm_tasks_open_deal_idx (открытые задачи сделки).
  async reassignOpenOfDeal({ dealId, from, to }) {
    const rows = await executor()
      .update(crmTasks)
      .set({ assigneeId: to, remindedAt: null })
      .where(and(eq(crmTasks.dealId, dealId), isNull(crmTasks.doneAt), from ? or(isNull(crmTasks.assigneeId), eq(crmTasks.assigneeId, from)) : isNull(crmTasks.assigneeId)))
      .returning({ id: crmTasks.id });
    return rows.length;
  },
  async update(id, patch) {
    const rearm = "dueAt" in patch || "remindBeforeMin" in patch || "assigneeId" in patch;
    await executor()
      .update(crmTasks)
      .set({ ...patch, ...(rearm ? { remindedAt: null } : {}) })
      .where(eq(crmTasks.id, id));
  },
  delete: async (id) => void (await executor().delete(crmTasks).where(eq(crmTasks.id, id))),
};

export const drizzleNotes: NoteRepository = {
  async find(id) {
    const [n] = await executor().select({ id: crmNotes.id, kind: crmNotes.kind, text: crmNotes.text, clientId: crmNotes.clientId, orderId: crmNotes.orderId, dealId: crmNotes.dealId }).from(crmNotes).where(eq(crmNotes.id, id)).limit(1);
    return n ?? null;
  },
  add: async (n) => void (await executor().insert(crmNotes).values(n)),
  async exists({ dealId, text }) {
    const [n] = await executor().select({ id: crmNotes.id }).from(crmNotes).where(and(eq(crmNotes.dealId, dealId), eq(crmNotes.text, text))).limit(1);
    return !!n;
  },
  delete: async (id) => void (await executor().delete(crmNotes).where(eq(crmNotes.id, id))),
};

/**
 * Read-модель: клиенты, у которых номер есть, но не основным телефоном — в дополнительных телефонах или в контакте
 * заказа. Такое совпадение не подтверждает, чей аккаунт: по нему никого не привязывают и не заводят второй аккаунт —
 * решает менеджер. Номер сравнивается по цифрам (8… и 7… — один номер).
 */
export async function accountsByOtherPhones(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return [];
  const kz = digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8")) ? digits.slice(1) : null;
  const variants = kz ? [`7${kz}`, `8${kz}`] : [digits];
  const list = sql.join(
    variants.map((v) => sql`${v}`),
    sql`, `,
  );
  const extra = sql`exists (select 1 from unnest("users"."extra_phones") p where regexp_replace(p, '\\D', '', 'g') in (${list}))`;
  const ordered = sql`exists (select 1 from orders o where o.user_id = ${usersId} and regexp_replace(coalesce(o.contact_phone, ''), '\\D', '', 'g') in (${list}))`;
  return executor()
    .select({ id: users.id, role: users.role, email: users.email, name: users.name, phone: users.phone })
    .from(users)
    .where(sql`${users.role} = 'user' and (${extra} or ${ordered})`)
    .limit(5);
}

/** Read-модель: пользовался ли клиент аккаунтом — заходил на сайт, начинал книги, оформлял заказы. */
export async function accountUsage(userId: string): Promise<AccountUsage> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return { lastSeenAt: null, books: 0, orders: 0 };
  const [[u], [b], [o]] = await Promise.all([
    executor().select({ lastSeenAt: users.lastSeenAt }).from(users).where(eq(users.id, userId)).limit(1),
    executor().select({ n: sql<number>`count(*)::int` }).from(books).where(eq(books.userId, userId)),
    executor().select({ n: sql<number>`count(*)::int` }).from(orders).where(eq(orders.userId, userId)),
  ]);
  return { lastSeenAt: u?.lastSeenAt ?? null, books: b?.n ?? 0, orders: o?.n ?? 0 };
}

export const drizzleLinks: CrmLinks = {
  async clientOfOrder(orderId) {
    const [o] = await executor().select({ userId: orders.userId }).from(orders).where(eq(orders.id, orderId)).limit(1);
    return o?.userId ?? null;
  },
  async clientOfDeal(dealId) {
    const [d] = await executor().select({ clientId: crmDeals.clientId }).from(crmDeals).where(eq(crmDeals.id, dealId)).limit(1);
    return d?.clientId ?? null;
  },
  async dealAssignee(dealId) {
    const [d] = await executor().select({ assigneeId: crmDeals.assigneeId }).from(crmDeals).where(eq(crmDeals.id, dealId)).limit(1);
    return d?.assigneeId ?? null;
  },
};

export const drizzleStaff: StaffDirectory = {
  async isActiveStaff(userId) {
    const [u] = await executor().select({ id: users.id }).from(users).where(and(eq(users.id, userId), eq(users.role, "admin"), eq(users.staffDisabled, false))).limit(1);
    return !!u;
  },
  async mentionable() {
    const rows = await executor().select({ id: users.id, name: users.name, email: users.email }).from(users).where(and(eq(users.role, "admin"), eq(users.staffDisabled, false)));
    return rows.map((r) => ({ id: r.id, label: staffLabel(r) }));
  },
};

export type ContactTarget = { clientId?: string; dealId?: string; orderId?: string; callId?: string };

/** Read-модель: контакт для звонка, чата или письма — по звонку, сделке, заказу или клиенту (номер берём на сервере). */
export async function resolveContact(target: ContactTarget) {
  const db = executor();
  if (target.callId) {
    const [c] = await db.select().from(crmCalls).where(eq(crmCalls.id, target.callId)).limit(1);
    return c ? { phone: c.clientPhone, email: null as string | null, clientId: c.clientId, assigneeId: c.staffId, name: "", dealId: c.dealId } : null;
  }
  if (target.dealId) {
    const [d] = await db.select().from(crmDeals).where(eq(crmDeals.id, target.dealId)).limit(1);
    if (!d) return null;
    const [client] = d.clientId ? await db.select({ phone: users.phone, email: users.email }).from(users).where(eq(users.id, d.clientId)).limit(1) : [];
    return { phone: d.contactPhone ?? client?.phone ?? null, email: d.contactEmail ?? client?.email ?? null, clientId: d.clientId, assigneeId: d.assigneeId, name: d.contactName, dealId: d.id as string | null };
  }
  if (target.orderId) {
    const [o] = await db.select().from(orders).where(eq(orders.id, target.orderId)).limit(1);
    return o ? { phone: o.contactPhone, email: o.contactEmail, clientId: o.userId, assigneeId: o.assigneeId, name: o.contactName, dealId: null } : null;
  }
  if (target.clientId) {
    const [c] = await db.select().from(users).where(eq(users.id, target.clientId)).limit(1);
    if (!c) return null;
    let phone = c.phone;
    if (!phone) phone = (await db.select({ p: orders.contactPhone }).from(orders).where(eq(orders.userId, c.id)).orderBy(desc(orders.createdAt)).limit(1))[0]?.p ?? null;
    return { phone, email: c.email, clientId: c.id, assigneeId: c.managerId, name: c.name, dealId: null };
  }
  return null;
}
