"use server";

import { container } from "@/server/container";
import { listFields, readFieldValues } from "@/modules/workspace";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertStaff, assertVisible, audit, can, canAssignOthers, ForbiddenError, type Staff } from "@/server/access";
import { notify } from "@/modules/workspace";
import { normalizePhone } from "@/shared/domain/phone";
import { dealSources, stageMilestones, type StageMilestone } from "@/modules/sales/domain/meta";

export interface DealFormState {
  error?: string;
  ok?: string;
}

const uuid = z.string().uuid();

async function loadDeal(staff: Staff, id: string) {
  const deal = await container().sales.deals.findById(uuid.parse(id));
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
  const deal = await container().sales.deals.create({
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
  await container().sales.deals.edit(
    deal.id,
    { title: d.title, contactName: d.contactName, amount: d.amount, source: d.source, tags, customFields, contacts: editContacts ? { phone: phone || null, email: d.contactEmail || null, extraPhones } : undefined },
    staff.user.id,
  );
  revalidateDeal(deal.id, deal.clientId);
  return { ok: "Сохранено" };
}

export async function moveDealAction(dealId: string, stageId: string, lostReason?: string) {
  const staff = await assertStaff("deals.edit");
  const deal = await loadDeal(staff, dealId);
  const stage = await container().sales.deals.stage(uuid.parse(stageId));
  if (!stage) throw new Error("Этап не найден");
  if (stage.kind === "lost" && !lostReason?.trim()) throw new Error("Укажите причину отказа");
  await container().sales.deals.move(deal.id, stage.id, staff.user.id, lostReason?.trim().slice(0, 200));
  // Сделку взял в работу тот, кто её двигает, если она была ничья.
  if (!deal.assigneeId) await container().sales.deals.assign(deal.id, staff.user.id);
  revalidateDeal(deal.id, deal.clientId);
}

export async function assignDealAction(dealId: string, assigneeId: string | null) {
  const staff = await assertStaff("deals.edit");
  const deal = await loadDeal(staff, dealId);
  const next = assigneeId ? uuid.parse(assigneeId) : null;
  if (!canAssignOthers(staff) && next !== staff.user.id) throw new ForbiddenError();
  if (next) {
    const u = await container().access.queries.activeStaff(next);
    if (!u) throw new Error("Сотрудник не найден");
    await container().sales.deals.note(deal, `Ответственный: ${u.name || u.email}`, staff.user.id);
    if (next !== staff.user.id) await notify([next], { kind: "deal", title: `Вам передали сделку №${deal.number}`, body: deal.title, link: `/admin/deals/${deal.id}` });
  }
  await container().sales.deals.assign(deal.id, next);
  revalidateDeal(deal.id, deal.clientId);
  return { ok: true as const };
}

export async function deleteDealAction(dealId: string) {
  const staff = await assertStaff("deals.delete");
  const deal = await loadDeal(staff, dealId);
  await container().sales.deals.delete(deal.id);
  await audit(staff, "deal.delete", "deal", deal.id, { number: deal.number, title: deal.title, amount: deal.amount });
  revalidateDeal(undefined, deal.clientId);
  redirect("/admin/deals");
}

/** Привязать сделку к клиенту (например, по номеру из чата нашёлся аккаунт на сайте). */
export async function linkDealClientAction(dealId: string, clientId: string | null) {
  const staff = await assertStaff("deals.edit", "clients.view");
  const deal = await loadDeal(staff, dealId);
  await container().sales.deals.linkClient(deal.id, clientId ? uuid.parse(clientId) : null);
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
  await container().sales.pipelines.saveStage({ id: id || null, pipelineId: parsed.data.pipelineId || null, name, color, milestone: parsed.data.milestone || null });
  await audit(staff, "settings.update", "stage", id || null, { name });
  revalidatePath("/admin/deals");
  revalidatePath("/admin/deals/stages");
  return { ok: "Сохранено" };
}

export async function moveStageAction(id: string, dir: -1 | 1) {
  await assertStaff("settings.manage");
  await container().sales.pipelines.moveStage(uuid.parse(id), dir);
  revalidatePath("/admin/deals");
  revalidatePath("/admin/deals/stages");
}

export async function deleteStageAction(id: string) {
  const staff = await assertStaff("settings.manage");
  const stage = await container().sales.pipelines.deleteStage(uuid.parse(id));
  if (!stage) return;
  await audit(staff, "settings.update", "stage", stage.id, { deleted: stage.name });
  revalidatePath("/admin/deals");
  revalidatePath("/admin/deals/stages");
}

// ─── неразобранное и дубли ─────────────────────────────────────────────────

/** Принять заявку из «Неразобранного»: в работу, ответственный — тот, кто принял (если не был назначен). */
export async function acceptDealAction(dealId: string) {
  const staff = await assertStaff("deals.edit");
  const deal = await loadDeal(staff, dealId);
  const accepted = await container().sales.deals.acceptByStaff(deal.id, staff.user.id);
  if (!accepted) return;
  await container().messaging.chats.assignDealConversations(deal.id, accepted.assigneeId ?? staff.user.id);
  revalidateDeal(deal.id, deal.clientId);
}

/** Отклонить заявку: сделка удаляется, переписка и звонки остаются. spam — номер больше не создаёт заявок. */
export async function rejectDealAction(dealId: string, spam: boolean) {
  const staff = await assertStaff("deals.edit");
  const deal = await loadDeal(staff, dealId);
  if (!deal.unsorted) throw new Error("Отклонить можно только неразобранную заявку — закройте сделку как «Отказ»");
  if (spam) await container().messaging.chats.blockDealContacts(deal.id, deal.contactPhone, staff.user.id);
  await container().sales.deals.reject(deal.id);
  await audit(staff, spam ? "deal.spam" : "deal.reject", "deal", deal.id, { number: deal.number, title: deal.title, phone: deal.contactPhone });
  revalidateDeal(undefined, deal.clientId);
}

/** Слить дубль source в target. */
export async function mergeDealAction(targetId: string, sourceId: string) {
  const staff = await assertStaff("deals.edit", "deals.delete");
  const target = await loadDeal(staff, targetId);
  const source = await loadDeal(staff, sourceId);
  await container().sales.deals.merge(target.id, source.id, staff.user.id);
  await audit(staff, "deal.merge", "deal", target.id, { merged: source.number, title: source.title });
  revalidateDeal(target.id, target.clientId);
}

/** Снять номер со спама (ошибочно отклонили). */
export async function unblockAction(value: string) {
  const staff = await assertStaff("settings.manage");
  await container().messaging.chats.unblock(z.string().min(1).max(100).parse(value));
  await audit(staff, "settings.update", "blocklist", value, { removed: true });
  revalidatePath("/admin/settings");
}

// ─── воронки ───────────────────────────────────────────────────────────────

/** Новая воронка сразу с минимальным набором этапов: в работе, успех, отказ. */
export async function createPipelineAction(_: DealFormState, form: FormData): Promise<DealFormState> {
  const staff = await assertStaff("settings.manage");
  const name = z.string().trim().min(2, "Название воронки").max(40).safeParse(form.get("name"));
  if (!name.success) return { error: name.error.issues[0].message };
  const p = await container().sales.pipelines.createPipeline(name.data);
  await audit(staff, "settings.update", "pipeline", p.id, { created: p.name });
  revalidatePath("/admin/deals");
  redirect(`/admin/deals/stages?p=${p.id}`);
}

export async function renamePipelineAction(id: string, name: string) {
  const staff = await assertStaff("settings.manage");
  const clean = z.string().trim().min(2).max(40).parse(name);
  await container().sales.pipelines.renamePipeline(uuid.parse(id), clean);
  await audit(staff, "settings.update", "pipeline", id, { name: clean });
  revalidatePath("/admin/deals");
  revalidatePath("/admin/deals/stages");
}

export async function deletePipelineAction(id: string) {
  const staff = await assertStaff("settings.manage");
  const pid = uuid.parse(id);
  await container().sales.pipelines.deletePipeline(pid);
  await audit(staff, "settings.update", "pipeline", pid, { deleted: true });
  revalidatePath("/admin/deals");
  redirect("/admin/deals/stages");
}

/** Перенести сделку в другую воронку — на её первый этап «в работе». */
export async function movePipelineAction(dealId: string, pipelineId: string) {
  const staff = await assertStaff("deals.edit");
  const deal = await loadDeal(staff, dealId);
  const first = await container().sales.deals.stageOfKind("open", uuid.parse(pipelineId));
  if (!first) throw new Error("В воронке нет этапов «в работе»");
  await container().sales.deals.move(deal.id, first.id, staff.user.id);
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
    const stage = await container().sales.deals.stage(req.stageId);
    if (!stage) throw new Error("Этап не найден");
    if (stage.kind === "lost" && !req.reason) throw new Error("Укажите причину отказа");
  }
  let done = 0;
  let skipped = 0;
  for (const id of list) {
    const deal = await container().sales.deals.findById(id);
    if (!deal || (staff.scope !== "all" && deal.assigneeId && deal.assigneeId !== staff.user.id)) {
      skipped++;
      continue;
    }
    if (req.op === "stage") await container().sales.deals.move(deal.id, req.stageId, staff.user.id, req.reason);
    else if (req.op === "assign") await container().sales.deals.assign(deal.id, req.userId);
    else if (req.op === "tag") await container().sales.deals.addTag(deal.id, req.tag);
    else await container().sales.deals.delete(deal.id);
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
  await container().sales.savedViews.add({ userId: staff.user.id, name: clean, query: allowed.toString(), shared: shared && staff.scope === "all" });
  revalidatePath("/admin/deals");
}

export async function deleteViewAction(id: string) {
  const staff = await assertStaff("deals.view");
  const view = await container().sales.savedViews.find(uuid.parse(id));
  if (!view) return;
  if (view.userId !== staff.user.id && !can(staff, "settings.manage")) throw new ForbiddenError();
  await container().sales.savedViews.delete(view.id);
  revalidatePath("/admin/deals");
}
