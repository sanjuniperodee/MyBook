import type { Clock, Logger, StaffNotification, UnitOfWork } from "@/shared/application";
import type { Deal, DealRepository } from "../domain";
import type { SalesSettings, StaffRouter } from "./ports";

/** Уведомления круга: менеджеру — по id, руководителям — когда заявку никто не взял. */
export interface RoutingNotifier {
  notify(userIds: string[], n: StaffNotification): Promise<void>;
  owners(n: StaffNotification): Promise<void>;
}

/** Сколько заявок раздаётся за один проход планировщика (раз в минуту). */
const BATCH = 20;

const link = (deal: Deal) => `/admin/deals/${deal.id}`;

/**
 * Круг после создания заявки: раздача тех, что пришли в нерабочее время или когда никого не было на смене,
 * и передача дальше, если ответственный не взял заявку (не ответил клиенту и не принял её) за N минут.
 * Каждая заявка — в своей транзакции под блокировкой круга: два прохода не отдадут её дважды.
 */
export class LeadRoutingService {
  constructor(
    private readonly deals: DealRepository,
    private readonly router: StaffRouter,
    private readonly settings: SalesSettings,
    private readonly notifier: RoutingNotifier,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  /** Следующий по кругу без назначения (правило «распределить по кругу», задача «перезвонить»); вне рабочего времени — null. */
  async next(): Promise<string | null> {
    return (await this.router.isWorkTime()) ? this.router.next([]) : null;
  }

  /** Проход планировщика: сначала ждущие без ответственного, потом не взятые вовремя. Возвращает, сколько заявок раздано. */
  async run(): Promise<number> {
    if (!(await this.router.isWorkTime())) return 0;
    let moved = 0;
    for (const id of await this.deals.waitingForRoute(BATCH)) moved += await this.safely(() => this.distribute(id));
    const minutes = await this.settings.reassignMinutes();
    if (minutes > 0) {
      const before = new Date(this.clock.now().getTime() - minutes * 60_000);
      for (const id of await this.deals.notTakenSince(before, BATCH)) moved += await this.safely(() => this.reroute(id, before, minutes));
    }
    return moved;
  }

  private async safely(work: () => Promise<number>) {
    try {
      return await work();
    } catch (err) {
      this.logger.error("routing", err);
      return 0;
    }
  }

  /** Заявка без ответственного (пришла ночью или на смене никого не было) — первому в очереди. */
  private async distribute(dealId: string): Promise<number> {
    const routed = await this.uow.run(async () => {
      await this.router.lock();
      const deal = await this.deals.findById(dealId);
      if (!deal || deal.assigneeId) return null;
      const next = await this.router.next(deal.routeTried);
      if (!next) return null;
      deal.route(next, this.clock.now());
      deal.note("Ответственный назначен по кругу: заявка пришла в нерабочее время или на смене никого не было", null);
      await this.deals.save(deal);
      this.uow.track(deal);
      return { deal, next };
    });
    if (!routed) return 0;
    await this.notifier.notify([routed.next], { kind: "deal", title: `Новая заявка №${routed.deal.number}`, body: routed.deal.title, link: link(routed.deal) });
    return 1;
  }

  /** Ответственный не взял заявку за N минут — следующему, кому она ещё не доставалась; обошла всех — руководителям. */
  private async reroute(dealId: string, before: Date, minutes: number): Promise<number> {
    const result = await this.uow.run(async () => {
      await this.router.lock();
      const deal = await this.deals.findById(dealId);
      // Пока ждали блокировку, заявку могли взять или передать вручную.
      if (!deal || !deal.isUnsorted || !deal.assigneeId || !deal.assignedAt || deal.assignedAt > before) return null;
      const prev = deal.assigneeId;
      const next = await this.router.next([...deal.routeTried, prev]);
      if (next) {
        deal.route(next, this.clock.now());
        deal.note(`Заявка передана следующему по кругу: ответственный не взял её за ${minutes} мин`, null);
      } else {
        // Некому передать: остаётся у нынешнего, отсчёт заново — руководитель получит напоминание через N минут снова.
        deal.restartRouteTimer(this.clock.now());
      }
      await this.deals.save(deal);
      this.uow.track(deal);
      return { deal, prev, next };
    });
    if (!result) return 0;
    const { deal, prev, next } = result;
    if (!next) {
      await this.notifier.owners({ kind: "sla", title: `Заявку №${deal.number} никто не взял`, body: `${deal.title} — все на смене получали её и не ответили за ${minutes} мин. Назначьте вручную.`, link: link(deal) });
      return 0;
    }
    await this.notifier.notify([next], { kind: "deal", title: `Вам передали заявку №${deal.number}`, body: `${deal.title} — прежний менеджер не ответил за ${minutes} мин`, link: link(deal) });
    await this.notifier.notify([prev], { kind: "sla", title: `Заявка №${deal.number} передана другому`, body: `Вы не ответили клиенту за ${minutes} мин`, link: link(deal) });
    return 1;
  }
}
