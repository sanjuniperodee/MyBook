"use server";

import { listFields, readFieldValues } from "@/lib/crm/fields";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { crmBlocklist, crmConversations, crmDeals, crmPipelines, crmSavedViews, crmStages, dealSources, users } from "@/lib/db/schema";
import { assertStaff, assertVisible, audit, can, canAssignOthers, ForbiddenError, type Staff } from "@/server/access";
import { addDealNote, assignDeal, createDeal, defaultPipelineId, mergeDeals, moveDeal, stageOfKind } from "@/lib/crm/deals";
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
  const customFields = readFieldValues(await listFields("deal"), form, deal.customFields);
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
      customFields,
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
  pipelineId: z.union([z.literal(""), uuid]).default(""),
});

export async function saveStageAction(_: DealFormState, form: FormData): Promise<DealFormState> {
  const staff = await assertStaff("settings.manage");
  const parsed = stageSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, name, color } = parsed.data;
  const milestone = parsed.data.milestone || null;
  const existing = id ? await db.query.crmStages.findFirst({ where: eq(crmStages.id, id) }) : null;
  const pipelineId = existing?.pipelineId ?? (parsed.data.pipelineId || (await defaultPipelineId()));
  // Одно событие — один этап в воронке, иначе непонятно, куда двигать сделку.
  if (milestone) await db.update(crmStages).set({ milestone: null }).where(and(eq(crmStages.milestone, milestone), eq(crmStages.pipelineId, pipelineId), id ? ne(crmStages.id, id) : undefined));
  if (id) await db.update(crmStages).set({ name, color, milestone, updatedAt: new Date() }).where(eq(crmStages.id, id));
  else {
    // Новый открытый этап — перед закрывающими (успех/отказ).
    const [{ pos }] = await db
      .select({ pos: sql<number>`coalesce(max(${crmStages.position}) filter (where ${crmStages.kind} = 'open'), 0)::int` })
      .from(crmStages)
      .where(eq(crmStages.pipelineId, pipelineId));
    await db
      .update(crmStages)
      .set({ position: sql`${crmStages.position} + 1` })
      .where(and(eq(crmStages.pipelineId, pipelineId), sql`${crmStages.position} > ${pos}`));
    await db.insert(crmStages).values({ name, color, milestone, position: pos + 1, kind: "open", pipelineId });
  }
  await audit(staff, "settings.update", "stage", id || null, { name });
  revalidatePath("/admin/deals");
  revalidatePath("/admin/deals/stages");
  return { ok: "Сохранено" };
}

export async function moveStageAction(id: string, dir: -1 | 1) {
  await assertStaff("settings.manage");
  const self = await db.query.crmStages.findFirst({ where: eq(crmStages.id, uuid.parse(id)) });
  if (!self) return;
  const stages = await db.select().from(crmStages).where(eq(crmStages.pipelineId, self.pipelineId)).orderBy(asc(crmStages.position));
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
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(crmStages)
    .where(and(eq(crmStages.kind, "open"), eq(crmStages.pipelineId, stage.pipelineId)));
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

// ─── воронки ───────────────────────────────────────────────────────────────

/** Новая воронка сразу с минимальным набором этапов: в работе, успех, отказ. */
export async function createPipelineAction(_: DealFormState, form: FormData): Promise<DealFormState> {
  const staff = await assertStaff("settings.manage");
  const name = z.string().trim().min(2, "Название воронки").max(40).safeParse(form.get("name"));
  if (!name.success) return { error: name.error.issues[0].message };
  const [{ pos }] = await db.select({ pos: sql<number>`coalesce(max(${crmPipelines.position}), 0)::int` }).from(crmPipelines);
  const [p] = await db.insert(crmPipelines).values({ name: name.data, position: pos + 1 }).returning();
  await db.insert(crmStages).values([
    { pipelineId: p.id, name: "Новая заявка", color: "#6b8fb5", position: 1, kind: "open" },
    { pipelineId: p.id, name: "В работе", color: "#d09a45", position: 2, kind: "open" },
    { pipelineId: p.id, name: "Успех", color: "#4f9a7e", position: 3, kind: "won" },
    { pipelineId: p.id, name: "Отказ", color: "#b45a5a", position: 4, kind: "lost" },
  ]);
  await audit(staff, "settings.update", "pipeline", p.id, { created: p.name });
  revalidatePath("/admin/deals");
  redirect(`/admin/deals/stages?p=${p.id}`);
}

export async function renamePipelineAction(id: string, name: string) {
  const staff = await assertStaff("settings.manage");
  const clean = z.string().trim().min(2).max(40).parse(name);
  await db.update(crmPipelines).set({ name: clean, updatedAt: new Date() }).where(eq(crmPipelines.id, uuid.parse(id)));
  await audit(staff, "settings.update", "pipeline", id, { name: clean });
  revalidatePath("/admin/deals");
  revalidatePath("/admin/deals/stages");
}

export async function deletePipelineAction(id: string) {
  const staff = await assertStaff("settings.manage");
  const pid = uuid.parse(id);
  if (pid === (await defaultPipelineId())) throw new Error("Основную воронку удалить нельзя — в неё приходят заявки с сайта, из чатов и звонков");
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(crmDeals)
    .innerJoin(crmStages, eq(crmStages.id, crmDeals.stageId))
    .where(eq(crmStages.pipelineId, pid));
  if (n) throw new Error(`В воронке ${n} сделок — сначала перенесите их`);
  await db.delete(crmPipelines).where(eq(crmPipelines.id, pid));
  await audit(staff, "settings.update", "pipeline", pid, { deleted: true });
  revalidatePath("/admin/deals");
  redirect("/admin/deals/stages");
}

/** Перенести сделку в другую воронку — на её первый этап «в работе». */
export async function movePipelineAction(dealId: string, pipelineId: string) {
  const staff = await assertStaff("deals.edit");
  const deal = await loadDeal(staff, dealId);
  const first = await stageOfKind("open", uuid.parse(pipelineId));
  if (!first) throw new Error("В воронке нет этапов «в работе»");
  await moveDeal(deal.id, first.id, staff.user.id);
  revalidateDeal(deal.id, deal.clientId);
}

// ─── массовые действия и сохранённые фильтры ───────────────────────────────

const bulkSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("stage"), stageId: uuid, reason: z.string().trim().max(200).optional() }),
  z.object({ op: z.literal("assign"), userId: z.union([uuid, z.null()]) }),
  z.object({ op: z.literal("tag"), tag: z.string().trim().toLowerCase().min(1).max(30) }),
  z.object({ op: z.literal("delete") }),
]);

/** Массовое действие над выбранными сделками. Недоступные роли сделки молча пропускаются. */
export async function bulkDealsAction(ids: string[], input: z.input<typeof bulkSchema>): Promise<{ done: number; skipped: number }> {
  const req = bulkSchema.parse(input);
  const staff = await assertStaff(req.op === "delete" ? "deals.delete" : "deals.edit");
  const list = z.array(uuid).max(500).parse(ids);
  if (req.op === "assign" && req.userId !== staff.user.id && !canAssignOthers(staff)) throw new ForbiddenError();
  if (req.op === "stage") {
    const stage = await db.query.crmStages.findFirst({ where: eq(crmStages.id, req.stageId) });
    if (!stage) throw new Error("Этап не найден");
    if (stage.kind === "lost" && !req.reason) throw new Error("Укажите причину отказа");
  }
  let done = 0;
  let skipped = 0;
  for (const id of list) {
    const deal = await db.query.crmDeals.findFirst({ where: eq(crmDeals.id, id) });
    if (!deal || (staff.scope !== "all" && deal.assigneeId && deal.assigneeId !== staff.user.id)) {
      skipped++;
      continue;
    }
    if (req.op === "stage") await moveDeal(deal.id, req.stageId, staff.user.id, req.reason);
    else if (req.op === "assign") await assignDeal(deal.id, req.userId);
    else if (req.op === "tag") await db.update(crmDeals).set({ tags: [...new Set([...deal.tags, req.tag])].slice(0, 12), updatedAt: new Date() }).where(eq(crmDeals.id, deal.id));
    else await db.delete(crmDeals).where(eq(crmDeals.id, deal.id));
    done++;
  }
  if (req.op === "delete" || req.op === "assign") await audit(staff, `deal.bulk_${req.op}`, "deal", null, { count: done, ...(req.op === "assign" ? { to: req.userId } : {}) });
  revalidatePath("/admin/deals");
  return { done, skipped };
}

export async function saveViewAction(name: string, query: string, shared: boolean) {
  const staff = await assertStaff("deals.view");
  const clean = z.string().trim().min(1, "Название фильтра").max(40).parse(name);
  // Сохраняем только параметры фильтра, без страницы и мусора.
  const params = new URLSearchParams(query);
  const allowed = new URLSearchParams();
  for (const [k, v] of params) if (/^(mine|a|src|q|view|p|task|stale|cf_[a-z0-9_]+)$/.test(k) && v) allowed.set(k, v.slice(0, 100));
  await db.insert(crmSavedViews).values({ userId: staff.user.id, entity: "deals", name: clean, query: allowed.toString(), shared: shared && staff.scope === "all" });
  revalidatePath("/admin/deals");
}

export async function deleteViewAction(id: string) {
  const staff = await assertStaff("deals.view");
  const view = await db.query.crmSavedViews.findFirst({ where: eq(crmSavedViews.id, uuid.parse(id)) });
  if (!view) return;
  if (view.userId !== staff.user.id && !can(staff, "settings.manage")) throw new ForbiddenError();
  await db.delete(crmSavedViews).where(eq(crmSavedViews.id, view.id));
  revalidatePath("/admin/deals");
}
