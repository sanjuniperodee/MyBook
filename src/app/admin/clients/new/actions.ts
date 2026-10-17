"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuid } from "@/server/input";
import { env } from "@/config/env";
import { getPlan, getVisiblePlans } from "@/config/site";
import { generateAccessPassword } from "@/lib/access-password";
import { accessMessage, staffLogin } from "@/app/admin/clients/new/access-message";
import { IdentityError } from "@/modules/identity/domain";
import type { DealPart, OnboardingResult } from "@/modules/clients";
import { isManualChannel, type ManualChannel } from "@/shared/domain/channels";
import { planLabels } from "@/modules/ordering/ui/labels";
import { MAX_PAYMENT } from "@/modules/sales/domain";
import { normalizePhone } from "@/shared/domain/phone";
import { assertStaff, audit, can, canAssignOthers } from "@/server/access";
import { container } from "@/server/container";

export interface NewClientDone {
  clientId: string;
  clientName: string;
  dealId: string | null;
  dealNumber: number | null;
  /** Платёж предоплаты (чек к нему догружается отдельным запросом). */
  paymentId: string | null;
  /** Все книги пакета: сделка, цена и доля предоплаты (чек догружается к каждой). */
  parts: DealPart[];
  /** Сколько книг оплачено/заказано сразу. */
  count: number;
  loginText: string;
  password: string;
  loginUrl: string;
  message: string;
  agreed: number;
  prepaid: number;
  remainder: number;
  tasks: number;
}

export interface NewClientState {
  error?: string;
  /** Что ввели в форму: React сбрасывает поля после отправки, при ошибке подставляем их обратно. */
  values?: Record<string, string>;
  /** Клиент с таким телефоном или почтой уже есть — на его карточку можно перейти. */
  existingId?: string;
  done?: NewClientDone;
}

const money = z.coerce.number().int("Сумма — целое число").min(0, "Сумма не может быть отрицательной").max(MAX_PAYMENT);

const schema = z.object({
  name: z.string().trim().min(1, "Укажите имя клиента").max(100),
  phone: z.string().trim().min(1, "Укажите телефон клиента").max(40),
  email: z.union([z.literal(""), z.string().trim().email("Проверьте адрес почты").max(200)]).default(""),
  locale: z.enum(["ru", "kk"]).default("ru"),
  password: z.union([z.literal(""), z.string().min(8, "Пароль — минимум 8 символов").max(200)]).default(""),
  city: z.string().trim().max(80).default(""),
  createDeal: z.string().optional(),
  recipient: z.string().trim().max(80).default(""),
  agreed: money.default(0),
  /** Сколько книг оплачено сразу: цена и предоплата — за пакет (цена — за одну книгу). */
  count: z.coerce.number().int("Количество книг — целое число").min(1, "Книг — хотя бы одна").max(20, "Не больше 20 книг в одной сделке").default(1),
  prepaid: money.default(0),
  deadline: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Проверьте срок")]).default(""),
  stageId: z.union([z.literal(""), uuid]).default(""),
  assigneeId: z.union([z.literal(""), uuid]).default(""),
  comment: z.string().trim().max(1000).default(""),
  /** Тариф договорённости: обязателен, если создаём сделку; заказ по договорённости оформляется только на него. */
  plan: z.string().default(""),
  /** Откуда пришёл клиент (канал продаж) — обязателен: от него считаются отчёты по каналам. */
  channel: z.string().refine(isManualChannel, "Укажите, откуда пришёл клиент (канал продаж)"),
});

/**
 * Менеджер заводит клиента. Сценарий — ClientOnboardingService (modules/clients): аккаунт, профиль, сделка,
 * предоплата, заметка с условиями и задачи. Здесь — форма, права и ответ: пароль возвращается один раз,
 * в базе остаётся только его хэш.
 */
export async function createClientAction(_: NewClientState, form: FormData): Promise<NewClientState> {
  const staff = await assertStaff("clients.create");
  const values = Object.fromEntries([...form.entries()].filter((e): e is [string, string] => typeof e[1] === "string"));
  const fail = (error: string, extra: Partial<NewClientState> = {}): NewClientState => ({ error, values, ...extra });
  const parsed = schema.safeParse(values);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const d = parsed.data;
  const channel = d.channel as ManualChannel;
  const withDeal = d.createDeal === "on" && can(staff, "deals.edit");
  if (withDeal && d.prepaid > d.agreed * d.count) return fail("Предоплата не может быть больше суммы договорённости");
  if (withDeal && !getVisiblePlans().some((p) => p.id === d.plan)) return fail("Выберите тариф, на который договорились");
  if (!normalizePhone(d.phone) || normalizePhone(d.phone).length < 10) return fail("Проверьте номер телефона");

  const password = d.password || generateAccessPassword();
  const plan = getPlan(d.plan);
  let result: OnboardingResult;
  try {
    result = await container().clients.onboarding.onboard(
      {
        name: d.name,
        phone: d.phone,
        email: d.email,
        locale: d.locale,
        password,
        city: d.city,
        recipient: d.recipient,
        channel,
        // Ответственный: сам менеджер (роль «только свои» видит лишь своих клиентов), руководитель может назначить другого.
        assigneeId: d.assigneeId && canAssignOthers(staff) ? d.assigneeId : staff.user.id,
        deal: withDeal ? { agreed: d.agreed, count: d.count, prepaid: d.prepaid, deadline: d.deadline, stageId: d.stageId, comment: d.comment, plan: d.plan, planLabel: plan ? planLabels[plan.id].toLowerCase() : d.plan } : null,
      },
      { userId: staff.user.id, name: staff.user.name || staff.user.email, seesAll: staff.scope === "all", allTasks: can(staff, "tasks.all") },
    );
  } catch (err) {
    if (IdentityError.is(err)) {
      if (err.code === "exists") return fail("Клиент с таким телефоном или почтой уже есть", { existingId: (err as unknown as { existingId?: string }).existingId });
      if (err.code === "phone") return fail("Проверьте номер телефона");
      if (err.code === "email") return fail("Проверьте адрес почты");
      if (err.code === "password") return fail("Пароль — минимум 8 символов");
    }
    throw err;
  }
  const { deal, paymentId, parts, tasks } = result;
  const account = { id: result.clientId, login: result.login };

  await audit(staff, "client.create", "client", account.id, { phone: normalizePhone(d.phone), deal: deal?.number ?? null, deals: parts.map((p) => p.dealNumber), count: withDeal ? d.count : 0, agreed: d.agreed, prepaid: d.prepaid, channel, plan: withDeal ? d.plan : null });
  revalidatePath("/admin/clients");
  revalidatePath("/admin/deals");
  const loginUrl = `${env.appUrl}${d.locale === "kk" ? "/kk" : ""}/login`;
  return {
    done: {
      clientId: account.id,
      clientName: d.name,
      dealId: deal?.id ?? null,
      dealNumber: deal?.number ?? null,
      paymentId,
      parts,
      count: withDeal ? d.count : 0,
      loginText: staffLogin(account.login, can(staff, "clients.contacts")),
      password,
      loginUrl,
      message: accessMessage({ name: d.name, login: account.login, password, loginUrl, locale: d.locale, hideLogin: !can(staff, "clients.contacts") }),
      agreed: d.agreed,
      prepaid: d.prepaid,
      remainder: Math.max(0, d.agreed * d.count - d.prepaid),
      tasks,
    },
  };
}

/** Выдать клиенту новый пароль (потерял, не получил): прежние входы завершаются. Пароль показывается один раз. */
export async function issueClientAccessAction(clientId: string): Promise<{ error?: string; loginText?: string; password?: string; message?: string }> {
  const staff = await assertStaff("clients.create");
  const id = uuid.safeParse(clientId);
  if (!id.success) return { error: "Клиент не найден" };
  const profile = await container().clients.clients.find(id.data);
  if (!profile) return { error: "Клиент не найден" };
  // «Только свои» меняет доступ лишь своим клиентам.
  if (staff.scope === "own" && profile.managerId !== staff.user.id) return { error: "Это клиент другого менеджера" };
  const password = generateAccessPassword();
  try {
    const r = await container().identity.accounts.issueClientPassword(id.data, password);
    await audit(staff, "client.access", "client", id.data);
    const loginUrl = `${env.appUrl}${r.locale === "kk" ? "/kk" : ""}/login`;
    const full = can(staff, "clients.contacts");
    return { loginText: staffLogin(r.login, full), password, message: accessMessage({ name: r.name, login: r.login, password, loginUrl, locale: r.locale, hideLogin: !full }) };
  } catch (err) {
    if (IdentityError.is(err)) return { error: "Для этого аккаунта пароль выдать нельзя" };
    throw err;
  }
}

export interface ClientDealsState {
  error?: string;
  /** Что ввели в форму — подставляем обратно при ошибке. */
  values?: Record<string, string>;
  done?: { clientId: string; clientName: string; parts: DealPart[]; count: number; agreed: number; prepaid: number; remainder: number; tasks: number };
}

const dealsSchema = z.object({
  clientId: uuid,
  count: z.coerce.number().int("Количество книг — целое число").min(1, "Книг — хотя бы одна").max(20, "Не больше 20 книг в одной сделке").default(1),
  plan: z.string().default(""),
  agreed: money.refine((n) => n > 0, "Укажите цену книги по договорённости"),
  prepaid: money.default(0),
  recipient: z.string().trim().max(80).default(""),
  deadline: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Проверьте срок")]).default(""),
  stageId: z.union([z.literal(""), uuid]).default(""),
  assigneeId: z.union([z.literal(""), uuid]).default(""),
  comment: z.string().trim().max(1000).default(""),
});

/**
 * Сделки существующему клиенту: клиент оплатил сразу несколько книг (или договорились о цене). По сделке на книгу;
 * предоплата делится поровну, чек общий догружается к каждому платежу. В кабинете клиента пакет виден одной карточкой.
 */
export async function createClientDealsAction(_: ClientDealsState, form: FormData): Promise<ClientDealsState> {
  const staff = await assertStaff("deals.edit");
  const values = Object.fromEntries([...form.entries()].filter((e): e is [string, string] => typeof e[1] === "string"));
  const fail = (error: string): ClientDealsState => ({ error, values });
  const parsed = dealsSchema.safeParse(values);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const d = parsed.data;
  if (!getVisiblePlans().some((p) => p.id === d.plan)) return fail("Выберите тариф, на который договорились");
  if (d.prepaid > d.agreed * d.count) return fail("Предоплата не может быть больше суммы договорённости");
  const client = await container().clients.clients.find(d.clientId);
  if (!client) return fail("Клиент не найден");
  if (staff.scope === "own" && client.managerId && client.managerId !== staff.user.id) return fail("Это клиент другого менеджера");
  const phone = client.phone ?? "";
  const plan = getPlan(d.plan);
  const { parts, tasks } = await container().clients.onboarding.addDeals(
    {
      clientId: client.id,
      name: client.name || client.email.split("@")[0],
      phone,
      email: client.email.endsWith(".invalid") ? "" : client.email,
      city: "",
      recipient: d.recipient,
      locale: "ru",
      assigneeId: d.assigneeId && canAssignOthers(staff) ? d.assigneeId : client.managerId ?? staff.user.id,
      deal: { agreed: d.agreed, count: d.count, prepaid: d.prepaid, deadline: d.deadline, stageId: d.stageId, comment: d.comment, plan: d.plan, planLabel: plan ? planLabels[plan.id].toLowerCase() : d.plan },
    },
    { userId: staff.user.id, name: staff.user.name || staff.user.email, seesAll: staff.scope === "all", allTasks: can(staff, "tasks.all") },
  );
  await audit(staff, "client.deals", "client", client.id, { deals: parts.map((p) => p.dealNumber), count: d.count, agreed: d.agreed, prepaid: d.prepaid, plan: d.plan });
  revalidatePath("/admin/deals");
  revalidatePath(`/admin/clients/${client.id}`);
  return { done: { clientId: client.id, clientName: client.name || client.email, parts, count: d.count, agreed: d.agreed, prepaid: d.prepaid, remainder: Math.max(0, d.agreed * d.count - d.prepaid), tasks } };
}
