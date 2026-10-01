import type { Clock, Logger, UnitOfWork } from "@/shared/application";
import { BOOK_READY_ANSWERS, Deal, Funnel, SalesError, type CustomValues, type DealRepository, type DealSource, type FunnelRepository, type NoteKind, type StageMilestone } from "../domain";
import type { BookProgress, ClientDirectory, SalesSettings, StaffRouter } from "./ports";

export interface NewDeal {
  title: string;
  source: DealSource;
  clientId?: string | null;
  contactName?: string;
  contactPhone?: string | null;
  contactEmail?: string | null;
  amount?: number;
  assigneeId?: string | null;
  createdById?: string | null;
  orderId?: string | null;
  stageId?: string;
  /** Заявка с нового контакта: попадёт в «Неразобранное» (если оно включено в настройках). */
  unsorted?: boolean;
  pipelineId?: string;
  customFields?: CustomValues;
  /** Откуда пришёл (UTM-метки, реферер, код ссылки). Для клиента с сайта берётся из его профиля, если не передано. */
  utm?: object | null;
}

/** Снимок сделки для вызывающего кода (страницы, чаты, телефония). */
export type DealView = ReturnType<Deal["snapshot"]>;

export class DealsService {
  constructor(
    private readonly deals: DealRepository,
    private readonly funnels: FunnelRepository,
    private readonly clients: ClientDirectory,
    private readonly settings: SalesSettings,
    private readonly router: StaffRouter,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  private async load(dealId: string) {
    const deal = await this.deals.findById(dealId);
    if (!deal) throw new SalesError("dealNotFound");
    return deal;
  }

  /** Сделка видна снаружи только после фиксации: реакции (автоматизации) уже отработали. */
  private async fresh(deal: Deal): Promise<DealView> {
    return ((await this.deals.findById(deal.id)) ?? deal).snapshot();
  }

  async create(input: NewDeal): Promise<DealView> {
    const funnel = await this.funnels.load();
    const stage = input.stageId ? funnel.stage(input.stageId) : funnel.firstOfKind("open", input.pipelineId ?? funnel.defaultPipelineId);
    if (!stage) throw new SalesError(input.stageId ? "stageNotFound" : "noOpenStage");
    let clientId = input.clientId ?? null;
    if (!clientId && input.contactPhone) clientId = await this.clients.findByPhone(input.contactPhone);
    const profile = clientId ? await this.clients.profile(clientId) : null;
    const unsorted = !!input.unsorted && !clientId && (await this.settings.unsortedEnabled());
    const { id, number } = await this.deals.nextIdentity();
    const deal = Deal.open(
      id,
      number,
      {
        title: input.title,
        stageId: stage.id,
        source: input.source,
        clientId,
        contactName: input.contactName ?? "",
        contactPhone: input.contactPhone ?? null,
        contactEmail: input.contactEmail ?? null,
        amount: input.amount ?? 0,
        // Ответственный клиента становится ответственным за сделку.
        assigneeId: input.assigneeId ?? profile?.managerId ?? null,
        createdById: input.createdById ?? null,
        orderId: input.orderId ?? null,
        unsorted,
        customFields: input.customFields ?? {},
        utm: (input.utm as Record<string, string> | null | undefined) ?? profile?.utm ?? null,
      },
      stage,
      this.clock.now(),
    );
    await this.uow.run(async () => {
      await this.deals.add(deal);
      this.uow.track(deal);
    });
    return this.fresh(deal);
  }

  async move(dealId: string, stageId: string, actorId: string | null, lostReason?: string | null): Promise<DealView | null> {
    const funnel = await this.funnels.load();
    const stage = funnel.stage(stageId);
    const deal = await this.deals.findById(dealId);
    if (!deal || !stage) return deal?.snapshot() ?? null;
    if (!deal.moveTo(stage, actorId, this.clock.now(), lostReason)) return deal.snapshot();
    await this.uow.run(async () => {
      await this.deals.save(deal);
      this.uow.track(deal);
    });
    return this.fresh(deal);
  }

  async assign(dealId: string, assigneeId: string | null) {
    const deal = await this.load(dealId);
    deal.assign(assigneeId);
    await this.uow.run(async () => {
      await this.deals.save(deal);
      if (deal.clientId && assigneeId) await this.clients.adoptManager(deal.clientId, assigneeId);
      this.uow.track(deal);
    });
    return deal.snapshot();
  }

  /** Слияние дублей: всё из source переносится в target, source удаляется. */
  async merge(targetId: string, sourceId: string, actorId: string | null) {
    if (targetId === sourceId) throw new SalesError("mergeSelf");
    return this.uow.run(async () => {
      const [target, source] = await Promise.all([this.load(targetId), this.load(sourceId)]);
      const before = { target: target.snapshot(), source: source.snapshot() };
      target.absorb(source, actorId);
      await this.deals.mergeInto(target, source);
      await this.deals.save(target);
      return before;
    });
  }

  note(deal: { id: string; clientId: string | null }, text: string, authorId: string | null, kind: NoteKind = "system") {
    return this.deals.addNote(deal, text, authorId, kind);
  }

  async fillEmptyFields(dealId: string, values: CustomValues) {
    const deal = await this.deals.findById(dealId);
    if (deal?.fillEmptyFields(values)) await this.deals.save(deal);
  }

  /** Правка карточки сделки. */
  async edit(dealId: string, patch: Parameters<Deal["edit"]>[0], actorId: string) {
    const deal = await this.load(dealId);
    deal.edit(patch, actorId);
    await this.deals.save(deal);
  }

  async delete(dealId: string) {
    await this.deals.delete(dealId);
  }

  async linkClient(dealId: string, clientId: string | null) {
    const deal = await this.load(dealId);
    deal.linkClient(clientId);
    await this.deals.save(deal);
  }

  async addTag(dealId: string, tag: string) {
    const deal = await this.load(dealId);
    deal.addTag(tag);
    await this.deals.save(deal);
  }

  /** Принять заявку из «Неразобранного»: ответственный — тот, кто принял (если не был назначен). */
  async acceptByStaff(dealId: string, staffId: string) {
    const deal = await this.load(dealId);
    if (!deal.accept(staffId)) return null;
    deal.note("Заявка принята в работу", staffId);
    await this.uow.run(async () => {
      await this.deals.save(deal);
      this.uow.track(deal);
    });
    return deal.snapshot();
  }

  /** Отклонить неразобранную заявку: сделка удаляется, переписка и звонки остаются. */
  async reject(dealId: string) {
    const deal = await this.load(dealId);
    if (!deal.isUnsorted) throw new SalesError("notUnsorted", "Отклонить можно только неразобранную заявку — закройте сделку как «Отказ»");
    await this.deals.delete(deal.id);
    return deal.snapshot();
  }

  async acceptUnsorted(dealId: string, authorId: string) {
    const deal = await this.deals.findById(dealId);
    if (deal?.accept(authorId)) await this.deals.save(deal);
  }

  async setUtmIfEmpty(dealId: string, utm: Record<string, string>) {
    const deal = await this.deals.findById(dealId);
    if (deal?.attributeIfUnknown(utm)) await this.deals.save(deal);
  }

  async setField(dealId: string, key: string, value: string | number | boolean | null) {
    const deal = await this.deals.findById(dealId);
    if (!deal) return;
    deal.setField(key, value);
    await this.deals.save(deal);
  }

  async findById(dealId: string) {
    return (await this.deals.findById(dealId))?.snapshot() ?? null;
  }

  async findOpen(opts: { clientId?: string | null; phone?: string | null }) {
    return (await this.deals.findOpen(opts))?.snapshot() ?? null;
  }

  findClientByPhone(phone: string | null | undefined) {
    return this.clients.findByPhone(phone);
  }

  nextRoundRobin() {
    return this.router.nextRoundRobin();
  }

  async defaultPipelineId() {
    const id = (await this.funnels.load()).defaultPipelineId;
    if (!id) throw new SalesError("noPipeline");
    return id;
  }

  async stage(stageId: string) {
    return (await this.funnels.load()).stage(stageId);
  }

  async stageOfKind(kind: "open" | "won" | "lost", pipelineId?: string) {
    const funnel = await this.funnels.load();
    return funnel.firstOfKind(kind, pipelineId ?? funnel.defaultPipelineId);
  }
}

/**
 * Воронка по действиям клиента на сайте: регистрация, книга, заказ, оплата. Сделка идёт только вперёд;
 * сделку заводим сами, начиная с настройки «с какого действия». Ошибка CRM не ломает сценарий клиента.
 */
export class SiteFunnelService {
  /** Какие вехи книги уже отработали (в памяти процесса — повтор безопасен, движение только вперёд). */
  readonly #reached = new Map<string, Set<StageMilestone>>();

  constructor(
    private readonly deals: DealRepository,
    private readonly funnels: FunnelRepository,
    private readonly clients: ClientDirectory,
    private readonly settings: SalesSettings,
    private readonly books: BookProgress,
    private readonly service: DealsService,
    private readonly logger: Logger,
  ) {}

  async advance(clientId: string, milestone: StageMilestone, opts: { title?: string; orderId?: string | null; amount?: number; customFields?: CustomValues } = {}): Promise<{ id: string } | null> {
    try {
      const funnel = await this.funnels.load();
      let deal = await this.deals.findOpen({ clientId });
      // Этап-цель ищем в воронке сделки; новая сделка с сайта — в основной воронке.
      const pipelineId = deal ? (funnel.stage(deal.stageId)?.pipelineId ?? null) : funnel.defaultPipelineId;
      const target = funnel.milestoneStage(milestone, pipelineId);
      if (!deal) {
        if (!Funnel.createsDeal(milestone, await this.settings.autoDealFrom())) return null;
        const client = await this.clients.profile(clientId);
        if (!client) return null;
        const created = await this.service.create({
          title: opts.title ?? `Сайт: ${client.name || client.email.split("@")[0]}`,
          source: "site",
          clientId,
          contactName: client.name,
          contactPhone: client.phone,
          contactEmail: client.email,
          amount: opts.amount ?? 0,
          orderId: opts.orderId ?? null,
          stageId: target?.id,
          customFields: opts.customFields,
        });
        deal = await this.deals.findById(created.id);
        if (!deal) return null;
      } else if (opts.orderId || opts.amount) {
        deal.attachOrder(opts.orderId ?? null, opts.amount);
        await this.deals.save(deal);
      }
      if (!target || !funnel.shouldAdvance(deal.stageId, target)) return { id: deal.id };
      return (await this.service.move(deal.id, target.id, null)) ?? { id: deal.id };
    } catch (err) {
      this.logger.error(`advance ${milestone}`, err);
      return null;
    }
  }

  /** Прогресс книги → вехи «половина» и «почти готова». */
  async bookProgressed(bookId: string, userId: string) {
    const seen = this.#reached.get(bookId) ?? new Set<StageMilestone>();
    if (seen.has("book_ready")) return;
    const p = await this.books.progress(bookId);
    if (!p) return;
    if (!seen.has("book_half") && p.total && p.answered * 2 >= p.total) {
      seen.add("book_half");
      await this.advance(userId, "book_half");
    }
    if (p.answered >= BOOK_READY_ANSWERS) {
      seen.add("book_ready");
      await this.advance(userId, "book_ready");
    }
    if (this.#reached.size > 5000) this.#reached.clear();
    this.#reached.set(bookId, seen);
  }

  /** Книга начата: сделка идёт по воронке, повод, дата и адресат попадают в её поля. */
  async bookStarted(userId: string, book: { title: string; recipientName: string }, fields: CustomValues) {
    const deal = await this.advance(userId, "book_started", { title: `Книга${book.recipientName ? ` для: ${book.recipientName}` : book.title ? ` «${book.title}»` : ""}`, customFields: fields });
    if (deal) await this.service.fillEmptyFields(deal.id, fields);
  }

  orderCreated(order: { id: string; userId: string; number: number; amount: number }) {
    return this.advance(order.userId, "order_created", { title: `Заказ №${order.number}`, orderId: order.id, amount: order.amount });
  }

  /** Оплата: сумма сделки — по заказу, сделка — на этап «оплачен». Возвращает сделку заказа. */
  async orderPaid(order: { id: string; userId: string; amount: number }) {
    const deals = await this.deals.findByOrder(order.id);
    for (const d of deals) {
      d.setAmount(order.amount);
      await this.deals.save(d);
    }
    if (deals.length) await this.advance(order.userId, "order_paid");
    return deals[0]?.id ?? null;
  }

  /** Отмена заказа — связанные сделки в «отказ». */
  async orderCancelled(orderId: string) {
    const funnel = await this.funnels.load();
    for (const d of await this.deals.findByOrder(orderId)) {
      const lost = funnel.firstOfKind("lost", funnel.stage(d.stageId)?.pipelineId ?? null);
      if (lost) await this.service.move(d.id, lost.id, null, "Заказ отменён");
    }
  }
}
