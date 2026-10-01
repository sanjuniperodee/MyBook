import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { crmCalls, crmDeals, crmNotes, crmTasks, orders, users } from "@/shared/infrastructure/db/schema";
import { adminLabel } from "@/modules/access/ui";
import { executor } from "@/shared/infrastructure/database";
import type { ClientRepository, CrmLinks, NoteRepository, StaffDirectory, TaskRepository } from "../application";

export const drizzleClients: ClientRepository = {
  async find(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [u] = await executor().select({ id: users.id, name: users.name, email: users.email, phone: users.phone, managerId: users.managerId, customFields: users.customFields }).from(users).where(eq(users.id, id)).limit(1);
    return u ?? null;
  },
  setManager: async (id, managerId) => void (await executor().update(users).set({ managerId }).where(eq(users.id, id))),
  setExtraPhones: async (id, phones) => void (await executor().update(users).set({ extraPhones: phones }).where(eq(users.id, id))),
  setCustomFields: async (id, values) => void (await executor().update(users).set({ customFields: values }).where(eq(users.id, id))),
  setTags: async (id, tags) => void (await executor().update(users).set({ tags }).where(eq(users.id, id))),
};

export const drizzleTasks: TaskRepository = {
  async find(id) {
    const [t] = await executor().select().from(crmTasks).where(eq(crmTasks.id, id)).limit(1);
    return t ?? null;
  },
  add: async (t) => void (await executor().insert(crmTasks).values(t)),
  setDone: async (id, doneAt) => void (await executor().update(crmTasks).set({ doneAt }).where(eq(crmTasks.id, id))),
  delete: async (id) => void (await executor().delete(crmTasks).where(eq(crmTasks.id, id))),
};

export const drizzleNotes: NoteRepository = {
  async find(id) {
    const [n] = await executor().select({ id: crmNotes.id, kind: crmNotes.kind, text: crmNotes.text, clientId: crmNotes.clientId, orderId: crmNotes.orderId, dealId: crmNotes.dealId }).from(crmNotes).where(eq(crmNotes.id, id)).limit(1);
    return n ?? null;
  },
  add: async (n) => void (await executor().insert(crmNotes).values(n)),
  delete: async (id) => void (await executor().delete(crmNotes).where(eq(crmNotes.id, id))),
};

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
    return rows.map((r) => ({ id: r.id, label: adminLabel(r) }));
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
