"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { crmBlocklist, crmConversations, crmDeals, crmStages, dealSources, users } from "@/lib/db/schema";
import { assertStaff, assertVisible, audit, can, canAssignOthers, ForbiddenError, type Staff } from "@/lib/crm/rbac";
import { addDealNote, assignDeal, createDeal, mergeDeals, moveDeal } from "@/lib/crm/deals";
import { notify } from "@/lib/crm/notify";
import { normalizePhone } from "@/lib/crm/phone";
import { formatPrice } from "@/config/site";
import { stageMilestones, type StageMilestone } from "@/lib/crm/deal-meta";

export interface DealFormState {
  error?: string;
  ok?: string;
}

const uuid = z.string().uuid();

async function loadDeal(staff: Staff, id: string) {
  const deal = await db.query.crmDeals.findFirst({ where: eq(crmDeals.id, uuid.parse(id)) });
  if (!deal) throw new Error("Сделка не найдена");
  assertVisible(staff, deal.assigneeId);
  return deal;
}

function revalidateDeal(id?: string, clientId?: string | null) {
  revalidatePath("/admin/deals");
  if (id) revalidatePath(`/admin/deals/${id}`);
  if (clientId) revalidatePath(`/admin/clients/${clientId}`);
}

const dealSchema = z.object({
  title: z.string().trim().min(2, "Назовите сделку").max(200),
  contactName: z.string().trim().max(120).default(""),
  contactPhone: z.string().trim().max(40).default(""),
  contactEmail: z.union([z.literal(""), z.string().trim().email("Некорректный e-mail").max(200)]).default(""),
  amount: z.coerce.number().int().min(0).max(100_000_000).default(0),
  source: z.enum(dealSources).default("manual"),
  stageId: z.union([z.literal(""), uuid]).default(""),
  assigneeId: z.union([z.literal(""), uuid]).default(""),
  clientId: z.union([z.literal(""), uuid]).default(""),
});

export async function createDealAction(_: DealFormState, form: FormData): Promise<DealFormState> {
  const staff = await assertStaff("deals.edit");
  const parsed = dealSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const phone = d.contactPhone ? normalizePhone(d.contactPhone) : "";
  if (d.contactPhone && phone.length < 10) return { error: "Проверьте номер телефона" };
  let assigneeId = d.assigneeId || staff.user.id;
  if (assigneeId !== staff.user.id && !canAssignOthers(staff)) assigneeId = staff.user.id;
  const deal = await createDeal({
    title: d.title,
    source: d.source,
    clientId: d.clientId || null,
    contactName: d.contactName,
    contactPhone: phone || null,
    contactEmail: d.contactEmail || null,
    amount: d.amount,
    assigneeId,
    createdById: staff.user.id,
    stageId: d.stageId || undefined,
  });
  revalidateDeal(deal.id, deal.clientId);
  redirect(`/admin/deals/${deal.id}`);
}

/** Правка полей карточки сделки (без этапа и ответственного — для них отдельные действия с историей). */
export async function updateDealAction(_: DealFormState, form: FormData): Promise<DealFormState> {
  const staff = await assertStaff("deals.edit");
  const deal = await loadDeal(staff, String(form.get("id") ?? ""));
  const parsed = dealSchema.pick({ title: true, contactName: true, contactPhone: true, contactEmail: true, amount: true, source: true }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  // Сотрудник без права видеть контакты не получает поля телефона/e-mail — сохраняем прежние значения.
  const editContacts = form.has("contactPhone") && can(staff, "clients.contacts");
  const phone = d.contactPhone ? normalizePhone(d.contactPhone) : "";
  if (editContacts && d.contactPhone && phone.length < 10) return { error: "Проверьте номер телефона" };
  const extraPhones = editContacts
    ? [...new Set(String(form.get("extraPhones") ?? "").split(/[,;\n]/).map((p) => normalizePhone(p)).filter((p) => p.length >= 10 && p !== phone))].slice(0, 5)
    : deal.extraPhones;
  const tags = [...new Set(String(form.get("tags") ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12).map((t) => t.slice(0, 30));
  await db
    .update(crmDeals)
    .set({
      title: d.title,
      contactName: d.contactName,
      ...(editContacts ? { contactPhone: phone || null, contactEmail: d.contactEmail || null, extraPhones } : {}),
      amount: d.amount,
      source: d.source,
      tags,
      updatedAt: new Date(),
    })
    .where(eq(crmDeals.id, deal.id));
  if (deal.amount !== d.amount) await addDealNote(deal, `Бюджет: ${formatPrice(deal.amount)} → ${formatPrice(d.amount)}`, staff.user.id);
  revalidateDeal(deal.id, deal.clientId);
  return { ok: "Сохранено" };
}

export async function moveDealAction(dealId: string, stageId: string, lostReason?: string) {
  const staff = await assertStaff("deals.edit");
  const deal = await loadDeal(staff, dealId);
  const stage = await db.query.crmStages.findFirst({ where: eq(crmStages.id, uuid.parse(stageId)) });
  if (!stage) throw new Error("Этап не найден");
  if (stage.kind === "lost" && !lostReason?.trim()) throw new Error("Укажите причину отказа");
  await moveDeal(deal.id, stage.id, staff.user.id, lostReason?.trim().slice(0, 200));
  // Сделку взял в работу тот, кто её двигает, если она была ничья.
  if (!deal.assigneeId) await assignDeal(deal.id, staff.user.id);
  revalidateDeal(deal.id, deal.clientId);
}

export async function assignDealAction(dealId: string, assigneeId: string | null) {
  const staff = await assertStaff("deals.edit");
  const deal = await loadDeal(staff, dealId);
  const next = assigneeId ? uuid.parse(assigneeId) : null;
  if (!canAssignOthers(staff) && next !== staff.user.id) throw new ForbiddenError();
  if (next) {
    const u = await db.query.users.findFirst({ where: eq(users.id, next), columns: { role: true, staffDisabled: true, name: true, email: true } });
    if (!u || u.role !== "admin" || u.staffDisabled) throw new Error("Сотрудник не найден");
    await addDealNote(deal, `Ответственный: ${u.name || u.email}`, staff.user.id);
    if (next !== staff.user.id) await notify([next], { kind: "deal", title: `Вам передали сделку №${deal.number}`, body: deal.title, link: `/admin/deals/${deal.id}` });
  }
  await assignDeal(deal.id, next);
  revalidateDeal(deal.id, deal.clientId);
  return { ok: true as const };
}

export async function deleteDealAction(dealId: string) {
  const staff = await assertStaff("deals.delete");
  const deal = await loadDeal(staff, dealId);
  await db.delete(crmDeals).where(eq(crmDeals.id, deal.id));
  await audit(staff, "deal.delete", "deal", deal.id, { number: deal.number, title: deal.title, amount: deal.amount });
  revalidateDeal(undefined, deal.clientId);
  redirect("/admin/deals");
}

/** Привязать сделку к клиенту (например, по номеру из чата нашёлся аккаунт на сайте). */
export async function linkDealClientAction(dealId: string, clientId: string | null) {
  const staff = await assertStaff("deals.edit", "clients.view");
  const deal = await loadDeal(staff, dealId);
  await db.update(crmDeals).set({ clientId: clientId ? uuid.parse(clientId) : null, updatedAt: new Date() }).where(eq(crmDeals.id, deal.id));
  revalidateDeal(deal.id, clientId ?? deal.clientId);
}

// ─── этапы воронки ─────────────────────────────────────────────────────────

const stageSchema = z.object({
  id: z.union([z.literal(""), uuid]).default(""),
  name: z.string().trim().min(1, "Название этапа").max(40),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#9a8f86"),
  milestone: z.union([z.enum(Object.keys(stageMilestones) as [StageMilestone, ...StageMilestone[]]), z.literal("")]).default(""),
});

export async function saveStageAction(_: DealFormState, form: FormData): Promise<DealFormState> {
  const staff = await assertStaff("settings.manage");
  const parsed = stageSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, name, color } = parsed.data;
  const milestone = parsed.data.milestone || null;
  // Одно событие — один этап, иначе непонятно, куда двигать сделку.
  if (milestone) await db.update(crmStages).set({ milestone: null }).where(and(eq(crmStages.milestone, milestone), id ? ne(crmStages.id, id) : undefined));
  if (id) await db.update(crmStages).set({ name, color, milestone, updatedAt: new Date() }).where(eq(crmStages.id, id));
  else {
    // Новый открытый этап — перед закрывающими (успех/отказ).
    const [{ pos }] = await db.select({ pos: sql<number>`coalesce(max(${crmStages.position}) filter (where ${crmStages.kind} = 'open'), 0)::int` }).from(crmStages);
    await db.update(crmStages).set({ position: sql`${crmStages.position} + 1` }).where(sql`${crmStages.position} > ${pos}`);
    await db.insert(crmStages).values({ name, color, milestone, position: pos + 1, kind: "open" });
  }
  await audit(staff, "settings.update", "stage", id || null, { name });
  revalidatePath("/admin/deals");
  revalidatePath("/admin/deals/stages");
  return { ok: "Сохранено" };
}

export async function moveStageAction(id: string, dir: -1 | 1) {
  await assertStaff("settings.manage");
  const stages = await db.select().from(crmStages).orderBy(asc(crmStages.position));
  const i = stages.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= stages.length || stages[i].kind !== "open" || stages[j].kind !== "open") return;
  await db.update(crmStages).set({ position: stages[j].position }).where(eq(crmStages.id, stages[i].id));
  await db.update(crmStages).set({ position: stages[i].position }).where(eq(crmStages.id, stages[j].id));
  revalidatePath("/admin/deals");
  revalidatePath("/admin/deals/stages");
}

export async function deleteStageAction(id: string) {
  const staff = await assertStaff("settings.manage");
  const stage = await db.query.crmStages.findFirst({ where: eq(crmStages.id, uuid.parse(id)) });
  if (!stage) return;
  if (stage.kind !== "open") throw new Error("Этапы «успех» и «отказ» нужны воронке — их можно только переименовать");
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(crmStages).where(eq(crmStages.kind, "open"));
  if (n <= 1) throw new Error("В воронке должен остаться хотя бы один этап в работе");
  const [{ deals }] = await db.select({ deals: sql<number>`count(*)::int` }).from(crmDeals).where(eq(crmDeals.stageId, stage.id));
  if (deals) throw new Error(`На этапе ${deals} сделок — сначала перенесите их`);
  await db.delete(crmStages).where(eq(crmStages.id, stage.id));
  await audit(staff, "settings.update", "stage", stage.id, { deleted: stage.name });
  revalidatePath("/admin/deals");
  revalidatePath("/admin/deals/stages");
}

// ─── неразобранное и дубли ─────────────────────────────────────────────────

/** Принять заявку из «Неразобранного»: в работу, ответственный — тот, кто принял (если не был назначен). */
export async function acceptDealAction(dealId: string) {
  const staff = await assertStaff("deals.edit");
  const deal = await loadDeal(staff, dealId);
  if (!deal.unsorted) return;
  await db.update(crmDeals).set({ unsorted: false, updatedAt: new Date() }).where(eq(crmDeals.id, deal.id));
  if (!deal.assigneeId) await assignDeal(deal.id, staff.user.id);
  await db.update(crmConversations).set({ assigneeId: deal.assigneeId ?? staff.user.id }).where(eq(crmConversations.dealId, deal.id));
  await addDealNote(deal, "Заявка принята в работу", staff.user.id);
  revalidateDeal(deal.id, deal.clientId);
}

/** Отклонить заявку: сделка удаляется, переписка и звонки остаются. spam — номер больше не создаёт заявок. */
export async function rejectDealAction(dealId: string, spam: boolean) {
  const staff = await assertStaff("deals.edit");
  const deal = await loadDeal(staff, dealId);
  if (!deal.unsorted) throw new Error("Отклонить можно только неразобранную заявку — закройте сделку как «Отказ»");
  if (spam) {
    const convs = await db.select({ chatId: crmConversations.chatId }).from(crmConversations).where(eq(crmConversations.dealId, deal.id));
    const values = [...new Set([deal.contactPhone ? normalizePhone(deal.contactPhone) : null, ...convs.map((c) => c.chatId)].filter((v): v is string => !!v))];
    if (values.length) await db.insert(crmBlocklist).values(values.map((value) => ({ value, createdById: staff.user.id }))).onConflictDoNothing();
    await db.update(crmConversations).set({ status: "closed", awaitingSince: null, unread: 0 }).where(eq(crmConversations.dealId, deal.id));
  }
  await db.delete(crmDeals).where(eq(crmDeals.id, deal.id));
  await audit(staff, spam ? "deal.spam" : "deal.reject", "deal", deal.id, { number: deal.number, title: deal.title, phone: deal.contactPhone });
  revalidateDeal(undefined, deal.clientId);
}

/** Слить дубль source в target. */
export async function mergeDealAction(targetId: string, sourceId: string) {
  const staff = await assertStaff("deals.edit", "deals.delete");
  const target = await loadDeal(staff, targetId);
  const source = await loadDeal(staff, sourceId);
  await mergeDeals(target.id, source.id, staff.user.id);
  await audit(staff, "deal.merge", "deal", target.id, { merged: source.number, title: source.title });
  revalidateDeal(target.id, target.clientId);
}

/** Снять номер со спама (ошибочно отклонили). */
export async function unblockAction(value: string) {
  const staff = await assertStaff("settings.manage");
  await db.delete(crmBlocklist).where(eq(crmBlocklist.value, z.string().min(1).max(100).parse(value)));
  await audit(staff, "settings.update", "blocklist", value, { removed: true });
  revalidatePath("/admin/settings");
}
