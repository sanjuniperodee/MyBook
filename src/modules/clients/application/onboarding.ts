import { formatPrice } from "@/config/site";
import { channels, manualAttribution, type ManualChannel } from "@/shared/domain/channels";
import { formatPhone, normalizePhone } from "@/shared/domain/phone";
import type { Actor, ClientsService, NotesService, TasksService } from "./services";

/** Учётные записи сайта (identity): аккаунт клиента, которого завёл менеджер. */
export interface OnboardingAccounts {
  /** Ошибки — IdentityError identity (exists, phone, email, password): их разбирает вызывающий. */
  provisionClient(input: { name: string; phone: string; email: string | null; password: string; locale: "ru" | "kk" }): Promise<{ id: string; login: string }>;
}

/** Продажи (sales): воронка, сделка с договорённостью и предоплата. */
export interface OnboardingSales {
  stages(): Promise<{ id: string; kind: string; name: string }[]>;
  createDeal(input: {
    title: string;
    source: "manual";
    clientId: string;
    contactName: string;
    contactPhone: string;
    contactEmail: string | null;
    amount: number;
    assigneeId: string;
    createdById: string;
    stageId?: string;
    customFields: Record<string, string | number>;
  }): Promise<{ id: string; number: number }>;
  setAgreedPlan(dealId: string, plan: string): Promise<void>;
  tagDeal(dealId: string, tag: string): Promise<void>;
  addPayment(input: { dealId: string; clientId: string; amount: number; createdById: string }): Promise<{ id: string }>;
  /** Привязать сделку (и её переписку) к аккаунту клиента. */
  linkClient(dealId: string, clientId: string): Promise<void>;
}

/** Клиент из сделки: контакт уже есть в сделке, договорённость и деньги — тоже. */
export interface DealOnboardingInput {
  dealId: string;
  name: string;
  phone: string;
  email: string;
  locale: "ru" | "kk";
  password: string;
  channel: ManualChannel;
  /** Ответственный клиента — ответственный сделки. */
  assigneeId: string;
}

/** Что менеджер ввёл в форму «Новый клиент» (уже проверено схемой формы). */
export interface OnboardingInput {
  name: string;
  phone: string;
  /** Пусто — клиент входит по телефону. */
  email: string;
  locale: "ru" | "kk";
  password: string;
  city: string;
  recipient: string;
  channel: ManualChannel;
  /** Ответственный за клиента и сделку. */
  assigneeId: string;
  /** Сделка с договорённостью — только если менеджеру можно вести сделки. */
  deal: null | {
    agreed: number;
    prepaid: number;
    /** YYYY-MM-DD или пусто. */
    deadline: string;
    /** Этап воронки; пусто — «Взяли в работу». */
    stageId: string;
    comment: string;
    plan: string;
    /** Тариф для заметки с условиями — как его пишут в тексте («твёрдая обложка»). */
    planLabel: string;
  };
}

export interface OnboardingResult {
  clientId: string;
  login: string;
  deal: { id: string; number: number } | null;
  /** Платёж предоплаты (чек к нему догружается отдельно). */
  paymentId: string | null;
  /** Сколько задач поставлено ответственному. */
  tasks: number;
}

const ruDate = (iso: string) => iso.split("-").reverse().join(".");

/**
 * Менеджер заводит клиента: аккаунт с логином и паролем (по телефону, если почты нет), CRM-профиль
 * (ответственный, метки, канал привлечения), сделка в воронке с суммой договорённости и предоплатой,
 * заметка с условиями и задачи (срок, остаток к оплате).
 */
export class ClientOnboardingService {
  constructor(
    private readonly accounts: OnboardingAccounts,
    private readonly sales: OnboardingSales,
    private readonly clients: ClientsService,
    private readonly notes: NotesService,
    private readonly tasks: TasksService,
  ) {}

  async onboard(input: OnboardingInput, actor: Actor): Promise<OnboardingResult> {
    const d = input.deal;
    const account = await this.accounts.provisionClient({ name: input.name, phone: input.phone, email: input.email || null, password: input.password, locale: input.locale });

    const profile = await this.clients.find(account.id);
    if (profile) {
      await this.clients.setManager(profile, input.assigneeId);
      await this.clients.setTags(account.id, ["вручную", ...(d && d.prepaid > 0 ? ["предоплата"] : [])]);
    }
    // Канал привлечения ставим до сделки: она подхватывает метки клиента, и отчёты по каналам сразу видят эту продажу.
    await this.clients.setSource(account.id, manualAttribution(input.channel) as Record<string, string>);

    if (!d) return { clientId: account.id, login: account.login, deal: null, paymentId: null, tasks: 0 };

    const deal = await this.openDeal(input, d, account.id, actor);
    // Предоплата — деньги: записываем платёж. Он сразу попадает в выручку (обзор, аналитика, планы, карточка клиента).
    const paymentId = d.prepaid > 0 ? (await this.sales.addPayment({ dealId: deal.id, clientId: account.id, amount: d.prepaid, createdById: actor.userId })).id : null;

    const phone = normalizePhone(input.phone);
    const terms = [
      `Канал: ${channels[input.channel]}.`,
      input.recipient ? `Кому книга: ${input.recipient}.` : null,
      `Клиент: ${input.name}${input.city ? `, г. ${input.city}` : ""}, тел. ${formatPhone(phone) || phone}${input.email ? `, ${input.email}` : ""}, язык — ${input.locale === "kk" ? "казахский" : "русский"}.`,
      d.deadline ? `Срок: до ${ruDate(d.deadline)} (желательно раньше).` : null,
      `Тариф: ${d.planLabel} (зафиксирован для заказа клиента).`,
      `Договорились на ${formatPrice(d.agreed)} за книгу (доставка и допы — сверху); предоплата ${formatPrice(d.prepaid)}${d.agreed > d.prepaid ? `; остаток ${formatPrice(d.agreed - d.prepaid)}` : ""}.`,
      d.comment || null,
      input.email ? null : "Почты нет: клиент входит по телефону.",
    ].filter(Boolean) as string[];
    await this.notes.add(actor, { kind: "note", text: terms.join("\n"), clientId: account.id, dealId: deal.id });

    let tasks = 0;
    if (d.deadline) {
      await this.tasks.create(actor, { title: `Книга для клиента ${input.name}: готова и передана до ${ruDate(d.deadline)} — желательно раньше`, kind: "task", dueAt: d.deadline, dealId: deal.id, clientId: account.id, assigneeId: input.assigneeId });
      tasks++;
    }
    if (d.agreed > d.prepaid) {
      await this.tasks.create(actor, { title: `Получить остаток ${formatPrice(d.agreed - d.prepaid)} от ${input.name}`, kind: "task", dueAt: d.deadline || undefined, dealId: deal.id, clientId: account.id, assigneeId: input.assigneeId });
      tasks++;
    }
    return { clientId: account.id, login: account.login, deal, paymentId, tasks };
  }

  /**
   * Клиент прямо из сделки (заявка из WhatsApp, звонок): аккаунт по телефону сделки, профиль с ответственным сделки
   * и каналом, сделка и её чаты привязываются к клиенту — договорённость, предоплата и переписка остаются в ней.
   */
  async onboardFromDeal(input: DealOnboardingInput, actor: Actor): Promise<{ clientId: string; login: string }> {
    const account = await this.accounts.provisionClient({ name: input.name, phone: input.phone, email: input.email || null, password: input.password, locale: input.locale });
    const profile = await this.clients.find(account.id);
    if (profile) {
      await this.clients.setManager(profile, input.assigneeId);
      await this.clients.setTags(account.id, ["вручную"]);
    }
    await this.clients.setSource(account.id, manualAttribution(input.channel) as Record<string, string>);
    await this.sales.linkClient(input.dealId, account.id);
    await this.notes.add(actor, { kind: "note", text: `Заведён аккаунт клиента на сайте: ${input.name}, язык — ${input.locale === "kk" ? "казахский" : "русский"}${input.email ? `, ${input.email}` : ", вход по телефону"}.`, clientId: account.id, dealId: input.dealId });
    return { clientId: account.id, login: account.login };
  }

  /** Сделка «вручную» с суммой договорённости, тарифом и метками; этап по умолчанию — «Взяли в работу». */
  private async openDeal(input: OnboardingInput, d: NonNullable<OnboardingInput["deal"]>, clientId: string, actor: Actor) {
    const custom: Record<string, string | number> = {};
    if (input.recipient) custom.recipient = input.recipient;
    if (d.deadline) custom.event_date = d.deadline;
    // Договорённость уже есть — это не новая заявка.
    const stages = await this.sales.stages();
    const stageId = d.stageId || stages.find((s) => s.kind === "open" && s.name === "Взяли в работу")?.id;
    const deal = await this.sales.createDeal({
      title: input.recipient ? `Книга — ${input.name} (${input.recipient})` : `Книга — ${input.name}`,
      source: "manual",
      clientId,
      contactName: input.name,
      contactPhone: normalizePhone(input.phone),
      contactEmail: input.email || null,
      amount: d.agreed,
      assigneeId: input.assigneeId,
      createdById: actor.userId,
      stageId,
      customFields: custom,
    });
    await this.sales.setAgreedPlan(deal.id, d.plan);
    for (const tag of ["вручную", ...(d.prepaid > 0 ? ["предоплата"] : []), ...(input.city ? [input.city.toLowerCase().slice(0, 30)] : [])]) await this.sales.tagDeal(deal.id, tag);
    return { id: deal.id, number: deal.number };
  }
}
