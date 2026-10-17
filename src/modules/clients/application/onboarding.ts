import { formatPrice } from "@/config/site";
import { channels, isManualChannel, manualAttribution, type ManualChannel } from "@/shared/domain/channels";
import { ClientsError } from "../domain/errors";
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
  /** Сделка — книга пакета: клиент оплатил сразу несколько книг. */
  setBatch(dealId: string, batchId: string, index: number, size: number): Promise<void>;
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
  deal: null | DealTerms;
}

/** Условия договорённости: цена одной книги, сколько книг оплачено сразу и общая предоплата. */
export interface DealTerms {
  /** Цена одной книги по договорённости, ₸. */
  agreed: number;
  /** Сколько книг клиент оплатил/заказал сразу (по умолчанию 1 — обычная сделка). */
  count?: number;
  /** Предоплата всего, по всем книгам, ₸. */
  prepaid: number;
  /** YYYY-MM-DD или пусто. */
  deadline: string;
  /** Этап воронки; пусто — «Взяли в работу». */
  stageId: string;
  comment: string;
  plan: string;
  /** Тариф для заметки с условиями — как его пишут в тексте («твёрдая обложка»). */
  planLabel: string;
}

/** Книга пакета: её сделка, цена и доля предоплаты с платежом (чек к нему догружается отдельно). */
export interface DealPart {
  dealId: string;
  dealNumber: number;
  agreed: number;
  prepaid: number;
  paymentId: string | null;
}

export interface OnboardingResult {
  clientId: string;
  login: string;
  /** Первая сделка (для ссылки). */
  deal: { id: string; number: number } | null;
  /** Платёж предоплаты первой сделки. */
  paymentId: string | null;
  /** Все сделки (по книге на каждую) с долями предоплаты. */
  parts: DealPart[];
  /** Сколько задач поставлено ответственному. */
  tasks: number;
}

/** Сделки к уже существующему клиенту (клиент оплатил сразу несколько книг или договорились о цене). */
export interface ExistingClientDealsInput {
  clientId: string;
  name: string;
  phone: string;
  email: string;
  city: string;
  recipient: string;
  locale: "ru" | "kk";
  assigneeId: string;
  deal: DealTerms;
}

/** Поровну на n частей, остаток — первым (сумма частей всегда равна total). */
export function splitEven(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const rest = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
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

    if (!d) return { clientId: account.id, login: account.login, deal: null, paymentId: null, parts: [], tasks: 0 };

    const { parts, tasks } = await this.openDeals(input, d, account.id, actor);
    return { clientId: account.id, login: account.login, deal: { id: parts[0].dealId, number: parts[0].dealNumber }, paymentId: parts[0].paymentId, parts, tasks };
  }

  /** Менеджер создаёт сделки существующему клиенту: клиент оплатил сразу несколько книг или договорились о цене. */
  async addDeals(input: ExistingClientDealsInput, actor: Actor): Promise<{ parts: DealPart[]; tasks: number }> {
    return this.openDeals({ ...input, password: "", channel: "other" as ManualChannel }, input.deal, input.clientId, actor);
  }

  /**
   * Сделки договорённости: по одной на книгу (у клиента с пакетом заказы оформляются по очереди — каждая книга забирает свою
   * сделку со своей долей цены и предоплаты). Предоплата делится поровну — платёж на каждую сделку, чек общий.
   */
  private async openDeals(input: Pick<OnboardingInput, "name" | "phone" | "email" | "locale" | "city" | "recipient" | "assigneeId"> & { password?: string; channel?: ManualChannel }, d: DealTerms, clientId: string, actor: Actor) {
    const count = Math.max(1, Math.min(20, Math.floor(d.count || 1)));
    const prices = Array.from({ length: count }, () => d.agreed);
    const prepaids = splitEven(d.prepaid, count);
    const batchId = count > 1 ? crypto.randomUUID() : null;
    const total = d.agreed * count;
    const parts: DealPart[] = [];
    let tasks = 0;
    for (let i = 0; i < count; i++) {
      const deal = await this.openDeal(input, { ...d, agreed: prices[i], prepaid: prepaids[i] }, clientId, actor, count > 1 ? `${i + 1} из ${count}` : null);
      if (batchId) await this.sales.setBatch(deal.id, batchId, i, count);
      // Предоплата — деньги: записываем платёж. Он сразу попадает в выручку (обзор, аналитика, планы, карточка клиента).
      const paymentId = prepaids[i] > 0 ? (await this.sales.addPayment({ dealId: deal.id, clientId, amount: prepaids[i], createdById: actor.userId })).id : null;
      parts.push({ dealId: deal.id, dealNumber: deal.number, agreed: prices[i], prepaid: prepaids[i], paymentId });

      const phone = normalizePhone(input.phone);
      const terms = [
        input.channel ? `Канал: ${channels[input.channel]}.` : null,
        count > 1 ? `Пакет: ${count} кн. — книга ${i + 1} из ${count} (оплачено сразу, по книге на сделку; сделки пакета: №${parts.map((p) => p.dealNumber).join(", №")}${i + 1 < count ? " и следующие" : ""}).` : null,
        input.recipient ? `Кому книга: ${input.recipient}.` : null,
        `Клиент: ${input.name}${input.city ? `, г. ${input.city}` : ""}, тел. ${formatPhone(phone) || phone}${input.email ? `, ${input.email}` : ""}, язык — ${input.locale === "kk" ? "казахский" : "русский"}.`,
        d.deadline ? `Срок: до ${ruDate(d.deadline)} (желательно раньше).` : null,
        `Тариф: ${d.planLabel} (зафиксирован для заказа клиента).`,
        `Договорились на ${formatPrice(prices[i])} за книгу (доставка и допы — сверху); предоплата${count > 1 ? " по книге" : ""} ${formatPrice(prepaids[i])}${prices[i] > prepaids[i] ? `; остаток ${formatPrice(prices[i] - prepaids[i])}` : ""}.`,
        count > 1 ? `Всего по пакету: ${count} × ${formatPrice(d.agreed)} = ${formatPrice(total)}; предоплата ${formatPrice(d.prepaid)}.` : null,
        d.comment || null,
        input.password !== undefined && !input.email ? "Почты нет: клиент входит по телефону." : null,
      ].filter(Boolean) as string[];
      await this.notes.add(actor, { kind: "note", text: terms.join("\n"), clientId, dealId: deal.id });

      if (d.deadline) {
        await this.tasks.create(actor, { title: `Книга${count > 1 ? ` ${i + 1}/${count}` : ""} для клиента ${input.name}: готова и передана до ${ruDate(d.deadline)} — желательно раньше`, kind: "task", dueAt: d.deadline, dealId: deal.id, clientId, assigneeId: input.assigneeId });
        tasks++;
      }
    }
    // Остаток к оплате — одной задачей на весь пакет.
    if (total > d.prepaid) {
      await this.tasks.create(actor, { title: `Получить остаток ${formatPrice(total - d.prepaid)} от ${input.name}${count > 1 ? ` (пакет ${count} кн.)` : ""}`, kind: "task", dueAt: d.deadline || undefined, dealId: parts[0].dealId, clientId, assigneeId: input.assigneeId });
      tasks++;
    }
    return { parts, tasks };
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

  /**
   * Клиента завела оплата счёта из чата (никого с номером чата нет, у сделки клиента нет): аккаунт по телефону (вход по
   * телефону, без события регистрации), имя и язык — из счёта, канал — из счёта, ответственный — ответственный сделки.
   * Пароль никто не знает: клиент задаёт его сам по ссылке доступа. Сделку и переписку привязывает вызывающий (общий
   * шаг для найденного и заведённого аккаунта). Ошибки аккаунта — IdentityError (exists с existingId, phone).
   */
  async onboardFromPayment(input: { name: string; phone: string; locale: "ru" | "kk"; channel: string; password: string; assigneeId: string | null }): Promise<{ clientId: string; login: string }> {
    const account = await this.accounts.provisionClient({ name: input.name, phone: input.phone, email: null, password: input.password, locale: input.locale });
    const profile = await this.clients.find(account.id);
    if (profile) {
      // Отключённый сотрудник ответственным не ставится — клиент остаётся без ответственного, аккаунт уже заведён.
      if (input.assigneeId) {
        try {
          await this.clients.setManager(profile, input.assigneeId);
        } catch (err) {
          if (!ClientsError.is(err)) throw err;
        }
      }
      await this.clients.setTags(account.id, ["вручную"]);
    }
    if (isManualChannel(input.channel)) await this.clients.setSource(account.id, manualAttribution(input.channel) as Record<string, string>);
    return { clientId: account.id, login: account.login };
  }

  /** Сделка «вручную» с суммой договорённости, тарифом и метками; этап по умолчанию — «Взяли в работу». */
  private async openDeal(input: Pick<OnboardingInput, "name" | "phone" | "email" | "city" | "recipient" | "assigneeId">, d: DealTerms, clientId: string, actor: Actor, part: string | null) {
    const custom: Record<string, string | number> = {};
    if (input.recipient) custom.recipient = input.recipient;
    if (d.deadline) custom.event_date = d.deadline;
    // Договорённость уже есть — это не новая заявка.
    const stages = await this.sales.stages();
    const stageId = d.stageId || stages.find((s) => s.kind === "open" && s.name === "Взяли в работу")?.id;
    const deal = await this.sales.createDeal({
      title: `${input.recipient ? `Книга — ${input.name} (${input.recipient})` : `Книга — ${input.name}`}${part ? ` · ${part}` : ""}`,
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
