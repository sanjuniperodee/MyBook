import type { Clock, Logger, UnitOfWork } from "@/shared/application";
import type { CustomFieldValues } from "@/shared/domain/customFields";
import type { StageMilestone } from "@/shared/domain/stageMilestones";
import { bookKind, progressOf } from "@/lib/content/kinds";
import { Deal, Funnel, SalesError, type DealRepository, type FunnelRepository, type NoteKind, type RejectionKind } from "../domain";
import type { DealSource } from "@/shared/domain/dealSources";
import { heldMoney, noDealInvoices, type BookProgress, type ClientDirectory, type DealInvoicesPort, type DealMoney, type SalesSettings, type StaffRouter } from "./ports";

/** Почему сделку нельзя удалить: по ней приняты деньги или есть счёт из чата, по которому клиент заплатил или ещё может заплатить. */
type DeleteBlocker = { code: "dealHasPayments" } | { code: "dealHasInvoice"; label: string; reason: "open" | "paid" | "kaspi" };

const blockerError = (b: DeleteBlocker) => {
  if (b.code === "dealHasPayments") return new SalesError("dealHasPayments", "По сделке приняты деньги — её нельзя удалить. Переведите её в «Проиграна» или слейте с другой сделкой: платежи и чеки перейдут туда.");
  const text = {
    open: `У сделки есть счёт ${b.label} — отмените его или объедините сделки`,
    paid: `У сделки есть оплаченный счёт ${b.label} — её нельзя удалить. Переведите её в «Проиграна» или объедините сделки: счёт перейдёт туда.`,
    kaspi: `По счёту ${b.label} ещё может прийти оплата Kaspi — удалить сделку можно после сверки. Переведите её в «Проиграна» или объедините сделки.`,
  }[b.reason];
  return new SalesError("dealHasInvoice", text);
};

/** То же коротко — для ленты заявки, которую не удалили, а закрыли «отказом». */
const blockerNote = (b: DeleteBlocker) =>
  b.code === "dealHasPayments" ? "по ней приняты деньги" : { open: `счёт ${b.label} ждёт оплаты (отменяется)`, paid: `оплачен счёт ${b.label}`, kaspi: `по счёту ${b.label} ещё может прийти оплата Kaspi` }[b.reason];

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
  customFields?: CustomFieldValues;
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
    /** Счета из чата по сделке (контекст «Заказы»): слияние переносит их, удаление — учитывает. */
    private readonly invoices: DealInvoicesPort = noDealInvoices,
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

  /**
   * Новая сделка. Без ответственного: постоянный клиент — к своему менеджеру (если тот работает), иначе — по кругу
   * (в рабочее время, под блокировкой круга: одновременные заявки расходятся). Никого нет — раздаст планировщик.
   */
  async create(input: NewDeal): Promise<DealView> {
    const funnel = await this.funnels.load();
    const stage = input.stageId ? funnel.stage(input.stageId) : funnel.firstOfKind("open", input.pipelineId ?? funnel.defaultPipelineId);
    if (!stage) throw new SalesError(input.stageId ? "stageNotFound" : "noOpenStage");
    let clientId = input.clientId ?? null;
    if (!clientId && input.contactPhone) clientId = await this.clients.findByPhone(input.contactPhone);
    const profile = clientId ? await this.clients.profile(clientId) : null;
    const unsorted = !!input.unsorted && !clientId && (await this.settings.unsortedEnabled());
    const { id, number } = await this.deals.nextIdentity();
    const deal = await this.uow.run(async () => {
      let assigneeId = input.assigneeId ?? null;
      let routed = false;
      if (!assigneeId && profile?.managerId && (await this.router.isActive(profile.managerId))) assigneeId = profile.managerId;
      if (!assigneeId && (await this.router.isWorkTime())) {
        await this.router.lock();
        assigneeId = await this.router.next([]);
        routed = !!assigneeId;
      }
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
          assigneeId,
          routed,
          createdById: input.createdById ?? null,
          orderId: input.orderId ?? null,
          unsorted,
          customFields: input.customFields ?? {},
          utm: (input.utm as Record<string, string> | null | undefined) ?? profile?.utm ?? null,
        },
        stage,
        this.clock.now(),
      );
      if (routed) deal.note("Ответственный назначен по кругу", null);
      await this.deals.add(deal);
      this.uow.track(deal);
      return deal;
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
    deal.assign(assigneeId, this.clock.now());
    await this.uow.run(async () => {
      await this.deals.save(deal);
      if (deal.clientId && assigneeId) await this.clients.adoptManager(deal.clientId, assigneeId);
      this.uow.track(deal);
    });
    return deal.snapshot();
  }

  /**
   * Слияние дублей: всё из source переносится в target, source удаляется. Деньги не теряются: платежи, чеки и счета из чата
   * переходят в target. Открытый счёт — один на сделку: открыт у обеих — открытый счёт source отменяется; target закрыта
   * или по ней заказ — открытые отменяются (платить по ним уже нельзя). Закрытую source не вливаем (mergeClosed) — до
   * переноса чего-либо. Возвращает снимки обеих сделок «до» — для журнала действий.
   */
  async merge(targetId: string, sourceId: string, actorId: string | null) {
    if (targetId === sourceId) throw new SalesError("mergeSelf");
    const funnel = await this.funnels.load();
    return this.uow.run(async () => {
      const [target, source] = await Promise.all([this.load(targetId), this.load(sourceId)]);
      const before = { target: target.snapshot(), source: source.snapshot() };
      target.absorb(source, funnel.stage(source.stageId), actorId);
      const kind = funnel.stage(target.stageId)?.kind;
      // Счета — первыми (порядок блокировок: счета → сделки), затем обе сделки: платёж, пришедший в эту секунду, не пропадёт.
      const { moved, cancelled } = await this.invoices.moveAll({ from: source.id, to: target.id, closeOpen: !!target.orderId || (!!kind && kind !== "open") });
      await this.deals.lock([target.id, source.id]);
      const parts = [moved.length ? `из сделки №${source.number} перенесены ${moved.join(", ")}` : "", cancelled.length ? `отменены открытые ${cancelled.join(", ")} (сделки объединены)` : ""].filter(Boolean);
      if (parts.length) target.note(`Счета из чата: ${parts.join("; ")}`, actorId);
      await this.deals.mergeInto(target, source);
      await this.deals.save(target);
      return before;
    });
  }

  note(deal: { id: string; clientId: string | null }, text: string, authorId: string | null, kind: NoteKind = "system") {
    return this.deals.addNote(deal, text, authorId, kind);
  }

  async fillEmptyFields(dealId: string, values: CustomFieldValues) {
    const deal = await this.deals.findById(dealId);
    if (deal?.fillEmptyFields(values)) await this.deals.save(deal);
  }

  /** Правка карточки сделки. */
  async edit(dealId: string, patch: Parameters<Deal["edit"]>[0], actorId: string) {
    const deal = await this.load(dealId);
    deal.edit(patch, actorId);
    await this.deals.save(deal);
  }

  /**
   * Удалить сделку. Нельзя, если по ней приняты деньги (платежи и чеки удалились бы вместе с ней) или есть счёт из чата,
   * который ждёт оплаты или оплачен (dealHasInvoice, 409 с понятным текстом). Отменённые и истёкшие счета удаляются вместе со сделкой.
   */
  async delete(dealId: string) {
    const blocker = await this.uow.run(() => this.removeIfFree(dealId));
    if (blocker) throw blockerError(blocker);
  }

  /** В транзакции: счета блокируются первыми, затем сделка; что-то держит её — ничего не удаляется (возвращается причина). */
  private async removeIfFree(dealId: string): Promise<DeleteBlocker | null> {
    const invoice = await this.invoices.holdForDelete(dealId);
    if (invoice) return { code: "dealHasInvoice", ...invoice };
    await this.deals.lock([dealId]);
    if (await this.deals.hasMoney(dealId)) return { code: "dealHasPayments" };
    await this.invoices.purgeClosed(dealId);
    await this.deals.delete(dealId);
    return null;
  }

  /** Договорённость по счёту из чата: цена книги — в сумму сделки (с записью в ленте, если изменилась). */
  async setAgreedTotal(dealId: string, total: number, actorId: string | null) {
    const deal = await this.load(dealId);
    const before = deal.snapshot().amount;
    if (before === total) return;
    deal.setAmount(total);
    deal.note(`Договорённость: цена книги ${before.toLocaleString("ru-RU")} → ${total.toLocaleString("ru-RU")} ₸ (счёт из чата)`, actorId);
    await this.deals.save(deal);
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
    await this.uow.run(async () => {
      await this.deals.save(deal);
      this.uow.track(deal);
    });
    return deal.snapshot();
  }

  /**
   * Отклонить неразобранную заявку (решение руководителя): сделка удаляется, переписка и звонки остаются. Удалить нельзя —
   * по ней деньги клиента или счёт из чата (те же правила, что у удаления), — заявка закрывается «отказом» с причиной:
   * деньги и счета остаются видны, открытый счёт отменит подписчик события «сделка закрыта». kept — почему не удалена.
   */
  async reject(dealId: string, opts: { kind?: RejectionKind; reason?: string; actorId?: string | null } = {}): Promise<{ deal: DealView; deleted: boolean; kept: string | null }> {
    const deal = await this.load(dealId);
    if (!deal.isUnsorted) throw new SalesError("notUnsorted", "Отклонить можно только неразобранную заявку — закройте сделку как «Отказ»");
    const blocker = await this.uow.run(() => this.removeIfFree(deal.id));
    if (!blocker) return { deal: deal.snapshot(), deleted: true, kept: null };
    const funnel = await this.funnels.load();
    const lost = funnel.firstOfKind("lost", funnel.stage(deal.stageId)?.pipelineId ?? funnel.defaultPipelineId);
    if (!lost) throw blockerError(blocker);
    const kept = blockerNote(blocker);
    deal.closeRejected(lost, opts.kind ?? "reject", opts.reason ?? "", kept, opts.actorId ?? null, this.clock.now());
    await this.uow.run(async () => {
      await this.deals.save(deal);
      this.uow.track(deal);
    });
    return { deal: await this.fresh(deal), deleted: false, kept };
  }

  async requestRejection(dealId: string, kind: RejectionKind, actorId: string, reason: string) {
    const deal = await this.load(dealId);
    if (!deal.isUnsorted) throw new SalesError("notUnsorted", "Отклонить можно только неразобранную заявку — закройте сделку как «Отказ»");
    deal.requestRejection(kind, actorId, reason);
    await this.deals.save(deal);
    return deal.snapshot();
  }

  async declineRejection(dealId: string, actorId: string) {
    const deal = await this.load(dealId);
    if (deal.declineRejection(actorId)) await this.deals.save(deal);
    return deal.snapshot();
  }

  /** Менеджер связался с клиентом (чат, звонок, заметка о контакте) — заявка принята в работу; how — как именно, в ленту. */
  async acceptUnsorted(dealId: string, authorId: string, how?: string) {
    const deal = await this.deals.findById(dealId);
    if (deal?.accept(authorId, how)) await this.deals.save(deal);
  }

  async setUtmIfEmpty(dealId: string, utm: Record<string, string>) {
    const deal = await this.deals.findById(dealId);
    if (deal?.attributeIfUnknown(utm)) await this.deals.save(deal);
  }

  /** Применить значения своих полей (предложения AI, которые выбрал менеджер). */
  async setFields(dealId: string, values: Record<string, string | number>) {
    const deal = await this.load(dealId);
    for (const [k, v] of Object.entries(values)) deal.setField(k, v);
    await this.deals.save(deal);
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

  /** Сделки по списку id — одним запросом; порядок как в ids, ненайденных нет. */
  async findByIds(ids: string[]) {
    const found = new Map((await this.deals.findByIds(ids)).map((d) => [d.id, d.snapshot()]));
    return ids.flatMap((id) => found.get(id) ?? []);
  }

  async findOpen(opts: { clientId?: string | null; phone?: string | null }) {
    return (await this.deals.findOpen(opts))?.snapshot() ?? null;
  }

  /** Сделки, связанные с заказом (обычно одна). */
  async byOrder(orderId: string) {
    return (await this.deals.findByOrder(orderId)).map((d) => d.snapshot());
  }

  findClientByPhone(phone: string | null | undefined) {
    return this.clients.findByPhone(phone);
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

/** Название сделки по книге: вид книги виден менеджеру в воронке с первого взгляда. */
export function bookDealTitle(book: { title: string; recipientName: string; theme?: string; authorName?: string }): string {
  const kind = bookKind(book.theme ?? "");
  if (kind === "autobiography") return book.authorName?.trim() ? `Автобиография: ${book.authorName.trim()}` : "Автобиография";
  if (kind === "blank") return book.title.trim() ? `Своя книга «${book.title.trim()}»` : "Своя книга";
  return `Книга${book.recipientName ? ` для: ${book.recipientName}` : book.title ? ` «${book.title}»` : ""}`;
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
    /**
     * Деньги клиента по сделке и действует ли по ней договорённость (то же правило, что у agreementForClient): сделка, которая
     * держит деньги клиента, при отмене заказа возвращается в работу, а её сумма — цена договорённости — заказом не переписывается.
     */
    private readonly money: (dealId: string) => Promise<DealMoney> = async () => ({ paid: 0, agreement: false }),
  ) {}

  /** Сделка держит деньги клиента (договорённость с предоплатой): сколько. */
  private async held(dealId: string) {
    return heldMoney(await this.money(dealId));
  }

  async advance(clientId: string, milestone: StageMilestone, opts: { title?: string; orderId?: string | null; amount?: number; customFields?: CustomFieldValues; dealId?: string | null } = {}): Promise<{ id: string } | null> {
    try {
      const funnel = await this.funnels.load();
      // Заказ по договорённости — к её сделке (даже если её вручную перевели в «успех» до заказа; оформление уже могло
      // привязать к ней этот заказ в своей транзакции), иначе — открытая сделка клиента.
      const agreed = opts.dealId ? await this.deals.findById(opts.dealId) : null;
      let deal = agreed && agreed.clientId === clientId && (!agreed.orderId || agreed.orderId === opts.orderId) ? agreed : await this.deals.findOpen({ clientId });
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
        // Сделка держит деньги клиента — её сумма остаётся ценой договорённости (иначе после отмены заказа договорённость
        // вернулась бы с итогом заказа — с доставкой и допами, и они посчитались бы второй раз).
        deal.attachOrder(opts.orderId ?? null, (await this.held(deal.id)) > 0 ? undefined : opts.amount);
        await this.deals.save(deal);
      }
      if (!target || !funnel.shouldAdvance(deal.stageId, target)) return { id: deal.id };
      return (await this.service.move(deal.id, target.id, null)) ?? { id: deal.id };
    } catch (err) {
      this.logger.error(`advance ${milestone}`, err);
      return null;
    }
  }

  /**
   * Прогресс книги → вехи «половина» и «почти готова» — по progressOf (у своей книги — по словам). Он монотонен:
   * готовая книга — и на половине, поэтому у длинных банков (любимому: 172 вопроса) «половина» не пропадает.
   */
  async bookProgressed(bookId: string, userId: string) {
    const seen = this.#reached.get(bookId) ?? new Set<StageMilestone>();
    if (seen.has("book_ready")) return;
    const p = await this.books.progress(bookId);
    if (!p) return;
    const progress = progressOf(bookKind(p.theme), p);
    if (!seen.has("book_half") && progress.half) {
      seen.add("book_half");
      await this.advance(userId, "book_half");
    }
    if (progress.ready) {
      seen.add("book_ready");
      await this.advance(userId, "book_ready");
    }
    if (this.#reached.size > 5000) this.#reached.clear();
    this.#reached.set(bookId, seen);
  }

  /**
   * Книга начата: сделка идёт по воронке, повод, дата и адресат попадают в её поля. Название сделки — по виду книги
   * (lib/content/kinds): подарок «Книга для: …», автобиография «Автобиография: {рассказчик}», своя книга «Своя книга «…»».
   */
  async bookStarted(userId: string, book: { title: string; recipientName: string; theme?: string; authorName?: string }, fields: CustomFieldValues) {
    const deal = await this.advance(userId, "book_started", { title: bookDealTitle(book), customFields: fields });
    if (deal) await this.service.fillEmptyFields(deal.id, fields);
  }

  orderCreated(order: { id: string; userId: string; number: number; amount: number; dealId?: string | null }) {
    return this.advance(order.userId, "order_created", { title: `Заказ №${order.number}`, orderId: order.id, amount: order.amount, dealId: order.dealId });
  }

  /** Оплата: сумма сделки — по заказу (кроме сделки, которая держит деньги клиента: там — цена договорённости), сделка — на этап «оплачен». Возвращает сделку заказа. */
  async orderPaid(order: { id: string; userId: string; amount: number }) {
    const deals = await this.deals.findByOrder(order.id);
    for (const d of deals) {
      if ((await this.held(d.id)) > 0) continue;
      d.setAmount(order.amount);
      await this.deals.save(d);
    }
    if (deals.length) await this.advance(order.userId, "order_paid");
    return deals[0]?.id ?? null;
  }

  /**
   * Отмена заказа. Сделка, которая держит деньги клиента (договорённость с предоплатой — ручная или оплаченная по счёту
   * из чата), отвязывается от заказа и возвращается в работу: договорённость снова действует (agreementForClient), по ней
   * можно выставить счёт, а менеджер видит в ленте, что деньги остались и нужно решить — продолжать или вернуть.
   * Остальные — в «отказ»; деньги без договорённости (не указан тариф) — менеджеру в ленту: новый заказ их не учтёт.
   */
  async orderCancelled(orderId: string, number?: number) {
    const funnel = await this.funnels.load();
    for (const d of await this.deals.findByOrder(orderId)) {
      const pipelineId = funnel.stage(d.stageId)?.pipelineId ?? null;
      const money = await this.money(d.id);
      const held = heldMoney(money);
      const reopen = held > 0 ? (["book_ready", "book_half", "book_started"] as const).map((m) => funnel.milestoneStage(m, pipelineId)).find(Boolean) ?? funnel.firstOfKind("open", pipelineId) : null;
      if (reopen) {
        d.detachOrder();
        await this.deals.save(d);
        await this.service.move(d.id, reopen.id, null);
        await this.service.note(d, `Заказ${number ? ` №${number}` : ""} отменён. Предоплата ${held.toLocaleString("ru-RU")} ₸ осталась у нас — сделка снова в работе, клиент может оформить новый заказ по договорённости. Если он не продолжает — оформите возврат в блоке «Оплата».`, null);
        continue;
      }
      const lost = funnel.firstOfKind("lost", pipelineId);
      if (lost) await this.service.move(d.id, lost.id, null, "Заказ отменён");
      if (money.paid > 0 && !money.agreement)
        await this.service.note(d, `Заказ${number ? ` №${number}` : ""} отменён. По сделке принято ${money.paid.toLocaleString("ru-RU")} ₸, но договорённость не оформлена (не указан тариф) — новый заказ эти деньги не учтёт. Укажите тариф договорённости и верните сделку в работу или оформите возврат.`, null);
    }
  }
}
