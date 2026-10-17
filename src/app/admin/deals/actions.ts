"use server";

import { container } from "@/server/container";
import { listFields, readFieldValues } from "@/modules/workspace";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { uuid } from "@/server/input";
import { assertStaff, assertWorkable, audit, can, canAssignOthers, ForbiddenError, type Staff } from "@/server/access";
import { notify, staffNotifier } from "@/modules/workspace";
import { staffLabel } from "@/shared/domain/staff";
import { normalizePhone } from "@/shared/domain/phone";
import { getPlan } from "@/config/site";
import { STAGE_MILESTONES } from "@/shared/domain/stageMilestones";
import { dealSources } from "@/shared/domain/dealSources";
import { MAX_PAYMENT, SalesError } from "@/modules/sales/domain";
import { env } from "@/config/env";
import { generateAccessPassword } from "@/lib/access-password";
import { accessMessage, displayLogin } from "@/app/admin/clients/new/access-message";
import { IdentityError } from "@/modules/identity/domain";
import { isManualChannel, type ManualChannel } from "@/shared/domain/channels";

export interface DealFormState {
  error?: string;
  ok?: string;
}


/** Сделка, с которой сотрудник может работать: своя или любая у роли «все записи» (неразобранные себе не берут). */
async function loadDeal(staff: Staff, id: string) {
  const deal = await container().sales.deals.findById(uuid.parse(id));
  if (!deal) throw new Error("Сделка не найдена");
  assertWorkable(staff, deal.assigneeId);
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
  amount: z.coerce.number().int().min(0).max(MAX_PAYMENT).default(0),
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

/**
 * Тариф договорённости. Клиент оформляет заказ по договорённости только на него. Пока по сделке нет заказа, тариф можно сменить;
 * пустое значение снимает фиксацию (клиент выберет тариф сам).
 */
export async function setDealAgreedPlanAction(dealId: string, plan: string | null): Promise<{ ok: boolean; message?: string }> {
  const staff = await assertStaff("deals.edit");
  const deal = await loadDeal(staff, dealId);
  if (deal.orderId) return { ok: false, message: "По сделке уже оформлен заказ: тариф не изменить" };
  const value = plan || null;
  if (value && !getPlan(value)) return { ok: false, message: "Выберите тариф из списка" };
  const before = await container().sales.agreedPlan.get(deal.id);
  if (!(await container().sales.agreedPlan.set(deal.id, value))) return { ok: false, message: "Не удалось сохранить тариф" };
  await container().sales.deals.note(deal, `Тариф договорённости: ${before ?? "не указан"} → ${value ?? "не указан"}`, staff.user.id, "system");
  await audit(staff, "deal.plan", "deal", deal.id, { from: before, to: value });
  revalidateDeal(deal.id, deal.clientId);
  return { ok: true };
}

export async function moveDealAction(dealId: string, stageId: string, lostReason?: string) {
  const staff = await assertStaff("deals.edit");
  const deal = await loadDeal(staff, dealId);
  const stage = await container().sales.deals.stage(uuid.parse(stageId));
  if (!stage) throw new Error("Этап не найден");
  if (stage.kind === "lost" && !lostReason?.trim()) throw new Error("Укажите причину отказа");
  await container().sales.deals.move(deal.id, stage.id, staff.user.id, lostReason?.trim().slice(0, 200));
  // Ничью сделку двигает только руководитель — она становится его (менеджеры ничьи себе не берут).
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
  if (next !== deal.assigneeId) await audit(staff, "deal.assign", "deal", deal.id, { number: deal.number, from: deal.assigneeId, to: next });
  revalidateDeal(deal.id, deal.clientId);
  return { ok: true as const };
}

/** Сделку не удалить: по ней приняты деньги или есть счёт из чата, по которому заплатили или ещё могут заплатить. */
const holdsMoney = (err: unknown): err is Error => SalesError.is(err) && (err.code === "dealHasPayments" || err.code === "dealHasInvoice");

export async function deleteDealAction(dealId: string): Promise<{ error: string } | void> {
  const staff = await assertStaff("deals.delete");
  const deal = await loadDeal(staff, dealId);
  try {
    await container().sales.deals.delete(deal.id);
  } catch (err) {
    // Деньги или счёт клиента (ждёт оплаты, оплачен) — сделку не удаляем: понятный текст вместо 500 (409).
    if (holdsMoney(err)) return { error: err.message };
    throw err;
  }
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
  milestone: z.union([z.enum(STAGE_MILESTONES), z.literal("")]).default(""),
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

/**
 * Отклонить заявку (spam — номер больше не создаёт заявок). Руководитель (право удалять сделки) — сразу: сделка удаляется,
 * переписка и звонки остаются. Менеджер только предлагает: сделка остаётся с отметкой, руководителям — уведомление.
 */
export async function rejectDealAction(dealId: string, spam: boolean, reason = ""): Promise<{ requested: boolean; message: string; deleted?: boolean }> {
  const staff = await assertStaff("deals.edit");
  const deal = await loadDeal(staff, dealId);
  if (!deal.unsorted) throw new Error("Отклонить можно только неразобранную заявку — закройте сделку как «Отказ»");
  const why = z.string().trim().max(200).parse(reason);
  if (!can(staff, "deals.delete")) {
    await container().sales.deals.requestRejection(deal.id, spam ? "spam" : "reject", staff.user.id, why);
    await audit(staff, spam ? "deal.spam_request" : "deal.reject_request", "deal", deal.id, { number: deal.number, title: deal.title, reason: why });
    await staffNotifier.notifyAllWith("deals.delete", { kind: "deal", title: `${spam ? "Спам?" : "Отклонить?"} Заявка №${deal.number}`, body: `${staffLabel(staff.user)} предлагает ${spam ? "отметить спамом" : "отклонить"}: ${deal.title}${why ? ` — ${why}` : ""}`, link: `/admin/deals/${deal.id}` });
    revalidateDeal(deal.id, deal.clientId);
    return { requested: true, message: "Отправлено руководителю — заявка останется у вас, пока он не решит" };
  }
  if (spam) await container().messaging.chats.blockDealContacts(deal.id, deal.contactPhone, staff.user.id);
  // Те же правила, что у удаления: деньги или счёт клиента — заявка не удаляется, а закрывается «отказом» (открытый счёт отменится).
  const result = await container().sales.deals.reject(deal.id, { kind: spam ? "spam" : "reject", reason: why, actorId: staff.user.id });
  const kept = result?.deleted === false ? result.kept : null;
  await audit(staff, spam ? "deal.spam" : "deal.reject", "deal", deal.id, { number: deal.number, title: deal.title, phone: deal.contactPhone, reason: why, ...(kept ? { kept } : {}) });
  revalidateDeal(kept ? deal.id : undefined, deal.clientId);
  if (kept) return { requested: false, deleted: false, message: `${spam ? "Номер в спаме. " : ""}Заявка не удалена (${kept}) — закрыта «отказом»` };
  return { requested: false, deleted: true, message: spam ? "Номер в спаме, заявка удалена" : "Заявка отклонена" };
}

/** Руководитель не согласился отклонять: заявка остаётся в работе у менеджера. */
export async function declineRejectionAction(dealId: string) {
  const staff = await assertStaff("deals.edit", "deals.delete");
  const deal = await loadDeal(staff, dealId);
  await container().sales.deals.declineRejection(deal.id, staff.user.id);
  await audit(staff, "deal.request_declined", "deal", deal.id, { number: deal.number });
  if (deal.assigneeId) await notify([deal.assigneeId], { kind: "deal", title: `Заявка №${deal.number} остаётся в работе`, body: "Руководитель не стал её отклонять — ответьте клиенту", link: `/admin/deals/${deal.id}` });
  revalidateDeal(deal.id, deal.clientId);
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
  const deals = new Map((await container().sales.deals.findByIds(list)).map((d) => [d.id, d]));
  for (const id of list) {
    const deal = deals.get(id);
    if (!deal || (staff.scope !== "all" && deal.assigneeId !== staff.user.id)) {
      skipped++;
      continue;
    }
    if (req.op === "stage") await container().sales.deals.move(deal.id, req.stageId, staff.user.id, req.reason);
    else if (req.op === "assign") await container().sales.deals.assign(deal.id, req.userId);
    else if (req.op === "tag") await container().sales.deals.addTag(deal.id, req.tag);
    else {
      try {
        await container().sales.deals.delete(deal.id);
      } catch (err) {
        // Сделку с деньгами или со счётом, который ждёт оплаты или оплачен, не удаляем — она в «пропущено».
        if (!holdsMoney(err)) throw err;
        skipped++;
        continue;
      }
    }
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

// ─── клиент из сделки ──────────────────────────────────────────────────────

const fromDealSchema = z.object({
  name: z.string().trim().min(1, "Укажите имя клиента").max(100),
  email: z.union([z.literal(""), z.string().trim().email("Проверьте адрес почты").max(200)]).default(""),
  locale: z.enum(["ru", "kk"]).default("ru"),
  channel: z.string().refine(isManualChannel, "Укажите, откуда пришёл клиент (канал продаж)"),
});

export type ClientFromDealState = { error?: string; existingId?: string; done?: { clientId: string; login: string; loginText: string; password: string; message: string } };

/**
 * Завести аккаунт клиента прямо из сделки: телефон — из сделки (сервер берёт его сам, менеджер мог его и не видеть),
 * ответственный — ответственный сделки. Сделка и её переписка привязываются к клиенту. Пароль показывается один раз.
 */
export async function createClientFromDealAction(dealId: string, _: ClientFromDealState, form: FormData): Promise<ClientFromDealState> {
  const staff = await assertStaff("clients.create", "deals.edit");
  const deal = await loadDeal(staff, dealId);
  if (deal.clientId) return { error: "Сделка уже привязана к клиенту", existingId: deal.clientId };
  const phone = normalizePhone(deal.contactPhone);
  if (phone.length < 10) return { error: "В сделке нет номера телефона клиента — добавьте его в контакт сделки" };
  const parsed = fromDealSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const password = generateAccessPassword();
  let account: { clientId: string; login: string };
  try {
    account = await container().clients.onboarding.onboardFromDeal(
      { dealId: deal.id, name: d.name, phone, email: d.email, locale: d.locale, password, channel: d.channel as ManualChannel, assigneeId: deal.assigneeId ?? staff.user.id },
      { userId: staff.user.id, name: staff.user.name || staff.user.email, seesAll: staff.scope === "all", allTasks: can(staff, "tasks.all") },
    );
  } catch (err) {
    if (IdentityError.is(err)) {
      if (err.code === "exists") return { error: "Клиент с таким телефоном или почтой уже есть — привяжите сделку к нему", existingId: (err as unknown as { existingId?: string }).existingId };
      if (err.code === "phone") return { error: "Проверьте номер телефона в сделке" };
      if (err.code === "email") return { error: "Проверьте адрес почты" };
    }
    throw err;
  }
  await audit(staff, "client.create", "client", account.clientId, { deal: deal.number, channel: d.channel, fromDeal: true });
  revalidateDeal(deal.id, account.clientId);
  const loginUrl = `${env.appUrl}${d.locale === "kk" ? "/kk" : ""}/login`;
  return { done: { clientId: account.clientId, login: account.login, loginText: displayLogin(account.login), password, message: accessMessage({ name: d.name, login: account.login, password, loginUrl, locale: d.locale }) } };
}
