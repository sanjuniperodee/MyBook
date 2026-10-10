"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { env } from "@/config/env";
import { formatPrice } from "@/config/site";
import { generateAccessPassword } from "@/lib/access-password";
import { accessMessage, displayLogin } from "@/app/admin/clients/new/access-message";
import { IdentityError } from "@/modules/identity/domain";
import { normalizePhone } from "@/shared/domain/phone";
import { assertStaff, audit, can, canAssignOthers, type Staff } from "@/server/access";
import { container } from "@/server/container";

export interface NewClientDone {
  clientId: string;
  clientName: string;
  dealId: string | null;
  dealNumber: number | null;
  login: string;
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

const uuid = z.string().uuid();
const money = z.coerce.number().int("Сумма — целое число").min(0, "Сумма не может быть отрицательной").max(100_000_000);

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
  prepaid: money.default(0),
  deadline: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Проверьте срок")]).default(""),
  stageId: z.union([z.literal(""), uuid]).default(""),
  assigneeId: z.union([z.literal(""), uuid]).default(""),
  comment: z.string().trim().max(1000).default(""),
});

const ruDate = (iso: string) => iso.split("-").reverse().join(".");

/**
 * Менеджер заводит клиента: аккаунт с логином и паролем (по телефону, если почты нет), сделка в воронке
 * с суммой договорённости и предоплатой, заметка с условиями и задачи (срок, остаток к оплате).
 * Пароль возвращается один раз — в базе остаётся только его хэш.
 */
export async function createClientAction(_: NewClientState, form: FormData): Promise<NewClientState> {
  const staff = await assertStaff("clients.create");
  const values = Object.fromEntries([...form.entries()].filter((e): e is [string, string] => typeof e[1] === "string"));
  const fail = (error: string, extra: Partial<NewClientState> = {}): NewClientState => ({ error, values, ...extra });
  const parsed = schema.safeParse(values);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const d = parsed.data;
  const withDeal = d.createDeal === "on" && can(staff, "deals.edit");
  if (withDeal && d.prepaid > d.agreed) return fail("Предоплата не может быть больше суммы договорённости");
  if (!normalizePhone(d.phone) || normalizePhone(d.phone).length < 10) return fail("Проверьте номер телефона");

  const password = d.password || generateAccessPassword();
  let account: { id: string; login: string };
  try {
    account = await container().identity.accounts.provisionClient({ name: d.name, phone: d.phone, email: d.email || null, password, locale: d.locale });
  } catch (err) {
    if (IdentityError.is(err)) {
      if (err.code === "exists") return fail("Клиент с таким телефоном или почтой уже есть", { existingId: (err as unknown as { existingId?: string }).existingId });
      if (err.code === "phone") return fail("Проверьте номер телефона");
      if (err.code === "email") return fail("Проверьте адрес почты");
      if (err.code === "password") return fail("Пароль — минимум 8 символов");
    }
    throw err;
  }

  // Ответственный: сам менеджер (роль «только свои» видит лишь своих клиентов), руководитель может назначить другого.
  const assigneeId = d.assigneeId && canAssignOthers(staff) ? d.assigneeId : staff.user.id;
  const crm = container().clients;
  const profile = await crm.clients.find(account.id);
  if (profile) {
    await crm.clients.setManager(profile, assigneeId);
    await crm.clients.setTags(account.id, ["вручную", ...(withDeal && d.prepaid > 0 ? ["предоплата"] : [])]);
  }

  const actor = { userId: staff.user.id, name: staff.user.name || staff.user.email, seesAll: staff.scope === "all", allTasks: can(staff, "tasks.all") };
  let deal: { id: string; number: number } | null = null;
  let tasks = 0;
  if (withDeal) deal = await createDeal(staff, assigneeId, account.id, d);
  if (deal) {
    const terms = [
      d.recipient ? `Кому книга: ${d.recipient}.` : null,
      `Клиент: ${d.name}${d.city ? `, г. ${d.city}` : ""}, тел. ${displayLogin(normalizePhone(d.phone))}${d.email ? `, ${d.email}` : ""}, язык — ${d.locale === "kk" ? "казахский" : "русский"}.`,
      d.deadline ? `Срок: до ${ruDate(d.deadline)} (желательно раньше).` : null,
      `Договорились на ${formatPrice(d.agreed)}; предоплата ${formatPrice(d.prepaid)}${d.agreed > d.prepaid ? `; остаток ${formatPrice(d.agreed - d.prepaid)}` : ""}.`,
      d.comment || null,
      d.email ? null : "Почты нет: клиент входит по телефону.",
    ].filter(Boolean) as string[];
    await crm.notes.add(actor, { kind: "note", text: terms.join("\n"), clientId: account.id, dealId: deal.id });
    if (d.deadline) {
      await crm.tasks.create(actor, { title: `Книга для клиента ${d.name}: готова и передана до ${ruDate(d.deadline)} — желательно раньше`, kind: "task", dueAt: d.deadline, dealId: deal.id, clientId: account.id, assigneeId });
      tasks++;
    }
    if (d.agreed > d.prepaid) {
      await crm.tasks.create(actor, { title: `Получить остаток ${formatPrice(d.agreed - d.prepaid)} от ${d.name}`, kind: "task", dueAt: d.deadline || undefined, dealId: deal.id, clientId: account.id, assigneeId });
      tasks++;
    }
  }

  await audit(staff, "client.create", "client", account.id, { phone: normalizePhone(d.phone), deal: deal?.number ?? null, agreed: d.agreed, prepaid: d.prepaid });
  revalidatePath("/admin/clients");
  revalidatePath("/admin/deals");
  const loginUrl = `${env.appUrl}${d.locale === "kk" ? "/kk" : ""}/login`;
  return {
    done: {
      clientId: account.id,
      clientName: d.name,
      dealId: deal?.id ?? null,
      dealNumber: deal?.number ?? null,
      login: account.login,
      loginText: displayLogin(account.login),
      password,
      loginUrl,
      message: accessMessage({ name: d.name, login: account.login, password, loginUrl, locale: d.locale }),
      agreed: d.agreed,
      prepaid: d.prepaid,
      remainder: Math.max(0, d.agreed - d.prepaid),
      tasks,
    },
  };
}

async function createDeal(staff: Staff, assigneeId: string, clientId: string, d: z.infer<typeof schema>) {
  const custom: Record<string, string | number> = {};
  if (d.prepaid > 0) custom.prepaid = d.prepaid;
  if (d.recipient) custom.recipient = d.recipient;
  if (d.deadline) custom.event_date = d.deadline;
  const deals = container().sales.deals;
  // Этап по умолчанию — «Взяли в работу»: договорённость уже есть, это не новая заявка.
  const stages = await container().sales.queries.listStages();
  const stageId = d.stageId || stages.find((s) => s.kind === "open" && s.name === "Взяли в работу")?.id;
  const deal = await deals.create({
    title: d.recipient ? `Книга для ${d.recipient.toLowerCase()} — ${d.name}` : `Книга — ${d.name}`,
    source: "manual",
    clientId,
    contactName: d.name,
    contactPhone: normalizePhone(d.phone),
    contactEmail: d.email || null,
    amount: d.agreed,
    assigneeId,
    createdById: staff.user.id,
    stageId,
    customFields: custom,
  });
  for (const tag of ["вручную", ...(d.prepaid > 0 ? ["предоплата"] : []), ...(d.city ? [d.city.toLowerCase().slice(0, 30)] : [])]) await deals.addTag(deal.id, tag);
  return { id: deal.id, number: deal.number };
}

/** Выдать клиенту новый пароль (потерял, не получил): прежние входы завершаются. Пароль показывается один раз. */
export async function issueClientAccessAction(clientId: string): Promise<{ error?: string; login?: string; loginText?: string; password?: string; message?: string }> {
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
    return { login: r.login, loginText: displayLogin(r.login), password, message: accessMessage({ name: r.name, login: r.login, password, loginUrl, locale: r.locale }) };
  } catch (err) {
    if (IdentityError.is(err)) return { error: "Для этого аккаунта пароль выдать нельзя" };
    throw err;
  }
}
