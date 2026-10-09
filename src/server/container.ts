import "server-only";
import { consoleLogger, systemClock, type Clock, type EventBus, type Mailer, type UnitOfWork } from "@/shared/application";
import { DrizzleUnitOfWork, InProcessEventBus, OutboxDispatcher } from "@/shared/infrastructure";
import { rootDb } from "@/shared/infrastructure/database";
import { deleteFile, putFile } from "@/shared/infrastructure/storage";
import { sql } from "drizzle-orm";
import { createRateLimiter, createStepStore, redisHealthy } from "@/shared/infrastructure/redis";
import { SmtpMailer } from "@/shared/infrastructure/mail";
import { OrderingModule } from "@/modules/ordering";
import { IdentityModule } from "@/modules/identity";
import { AccessModule } from "@/modules/access";
import { AuthoringModule } from "@/modules/authoring";
import { NotificationsModule } from "@/modules/notifications";
import { SalesModule, sourceFromChannel } from "@/modules/sales";
import { MessagingModule } from "@/modules/messaging";
import { TelephonyModule } from "@/modules/telephony";
import { MarketingModule } from "@/modules/marketing";
import { AssistantModule } from "@/modules/assistant";
import { ClientsModule } from "@/modules/clients";
import { ReportingModule } from "@/modules/reporting";
import { WorkspaceModule, notify, smtpConfig, staffWith } from "@/modules/workspace";
import { FeedbackModule } from "@/modules/feedback";
import { ReferralsModule, type InvitePromo } from "@/modules/referrals";
import type { PromoCode } from "@/modules/ordering";
import { AutomationModule } from "@/modules/automation";
import { BookPreviewService, PrintFilesService, type BookRenderer } from "@/modules/production";
import { pdfRenderQueue, reactPdfRenderer, storageFileStore } from "@/modules/production/infrastructure/adapters";
import { registerSubscriptions } from "./subscriptions";

/**
 * Корень композиции: единственное место, где модули собираются из реализаций.
 * Слой представления (страницы, server actions, роуты) получает модули отсюда и
 * ничего не знает о БД, SMTP, PDF и прочей инфраструктуре.
 */
export class Container {
  readonly bus: EventBus = new InProcessEventBus(consoleLogger("events"));
  readonly outbox = new OutboxDispatcher(this.bus, consoleLogger("outbox"));
  readonly uow: UnitOfWork = new DrizzleUnitOfWork(this.outbox);
  readonly clock: Clock = systemClock;
  /** Лимиты частоты: Redis, если задан REDIS_URL (несколько экземпляров), иначе память процесса. */
  readonly rateLimiter = createRateLimiter();
  /** Почта по SMTP: настройки из «Интеграций» (переменные SMTP_* важнее); без них письма пишутся в лог. */
  readonly smtp = new SmtpMailer(smtpConfig);
  readonly mailer: Mailer = this.smtp;

  #ordering?: OrderingModule;
  #identity?: IdentityModule;
  #access?: AccessModule;
  #authoring?: AuthoringModule;
  #notifications?: NotificationsModule;
  #sales?: SalesModule;
  #automation?: AutomationModule;
  #messaging?: MessagingModule;
  #telephony?: TelephonyModule;
  #marketing?: MarketingModule;
  #assistant?: AssistantModule;
  #clients?: ClientsModule;
  #feedback?: FeedbackModule;
  #referrals?: ReferralsModule;
  /** Отчёты — только чтение. */
  readonly reporting = new ReportingModule();
  readonly workspace = new WorkspaceModule();

  /** Правила CRM работают со сделками через узкий порт продаж. */
  get automation(): AutomationModule {
    return (this.#automation ??= new AutomationModule({
      clock: this.clock,
      sendMessage: async (conversationId, text) => void (await this.messaging.chats.send(conversationId, text, null)),
      sales: {
        nextRoundRobin: () => this.sales.deals.nextRoundRobin(),
        assign: async (dealId, userId) => void (await this.sales.deals.assign(dealId, userId)),
        move: async (dealId, stageId) => void (await this.sales.deals.move(dealId, stageId, null)),
        findOpenDealId: async (clientId) => (await this.sales.deals.findOpen({ clientId }))?.id ?? null,
        createDeal: (input) => this.sales.deals.create(input),
      },
    }));
  }

  /** Переписка создаёт и ведёт сделки через порт продаж, а правила на входящие — через движок автоматизаций. */
  get messaging(): MessagingModule {
    return (this.#messaging ??= new MessagingModule({
      clock: this.clock,
      rules: { messageIncoming: (ctx) => this.automation.engine.run("message.incoming", ctx) },
      links: { fromText: (text) => this.marketing.service.attributionFromText(text) },
      whatsapp: () => this.marketing.service.shopWhatsapp(),
      sales: {
        findClientByPhone: (phone) => this.sales.deals.findClientByPhone(phone),
        findOpenDeal: (opts) => this.sales.deals.findOpen(opts),
        createDeal: ({ channel, source, ...input }) => this.sales.deals.create({ ...input, source: source ?? sourceFromChannel(channel) }),
        setUtmIfEmpty: (dealId, utm) => this.sales.deals.setUtmIfEmpty(dealId, utm),
        acceptUnsorted: (dealId, authorId) => this.sales.deals.acceptUnsorted(dealId, authorId),
        note: (deal, text) => this.sales.deals.note(deal, text, null),
        setField: (dealId, key, value) => this.sales.deals.setField(dealId, key, value),
        deal: (dealId) => this.sales.deals.findById(dealId),
        nextRoundRobin: () => this.sales.deals.nextRoundRobin(),
      },
    }));
  }

  /** Звонки создают сделки через порт продаж; спам-лист — из переписки, правила на пропущенные — из автоматизаций. */
  get telephony(): TelephonyModule {
    return (this.#telephony ??= new TelephonyModule({
      clock: this.clock,
      isBlocked: (phone) => this.messaging.chats.isBlocked(phone),
      missedRules: (ctx) => this.automation.engine.run("call.missed", ctx),
      sales: {
        findClientByPhone: (phone) => this.sales.deals.findClientByPhone(phone),
        findOpenDealId: async (opts) => (await this.sales.deals.findOpen(opts))?.id ?? null,
        createCallDeal: (input) => this.sales.deals.create({ ...input, source: "call", unsorted: true }),
        dealOwner: (dealId) => this.sales.deals.findById(dealId),
      },
    }));
  }

  /** Персональные промокоды выпускает контекст заказов. */
  get marketing(): MarketingModule {
    return (this.#marketing ??= new MarketingModule({ clock: this.clock, promos: { issuePersonal: (input) => this.ordering.promos.issuePersonal(input) } }));
  }

  /** Приглашения: коды для друзей и награды — промокоды контекста заказов. */
  get referrals(): ReferralsModule {
    const promos = this.ordering.promos;
    const now = () => this.clock.now();
    const view = (p: PromoCode): InvitePromo => ({ code: p.code, ownerId: p.ownerId, percent: p.kind === "percent" ? p.value : 0, usable: p.rejection(now()) === null });
    return (this.#referrals ??= new ReferralsModule({
      mailer: this.mailer,
      clock: this.clock,
      logger: consoleLogger("referrals"),
      promos: {
        ownedBy: async (userId) => {
          const p = await promos.referralOf(userId);
          return p ? view(p) : null;
        },
        createInvite: async (input) => (await promos.issueReferral(input))?.code ?? null,
        lookup: async (code) => {
          const p = await promos.findByCode(code);
          return p ? view(p) : null;
        },
        issueReward: async (input) => (await promos.issuePersonal(input))?.code ?? null,
        status: async (codes) => {
          const found = await Promise.all(codes.map((c) => promos.findByCode(c)));
          return new Map(found.flatMap((p) => (p ? [[p.code, { used: p.rejection(now()) === "used", expiresAt: p.expiresAt }] as const] : [])));
        },
      },
    }));
  }

  /** Отзывы: благодарность — промокод контекста заказов, низкая оценка — уведомление тем, кто разбирает отзывы. */
  get feedback(): FeedbackModule {
    return (this.#feedback ??= new FeedbackModule({
      uow: this.uow,
      clock: this.clock,
      logger: consoleLogger("feedback"),
      promos: { issue: async (input) => (await this.ordering.promos.issuePersonal(input))?.code ?? null },
      alerts: {
        lowRating: async (r) =>
          notify(await staffWith("reviews.manage"), {
            kind: "system",
            title: `Отзыв ${r.rating}★ к заказу №${r.orderNumber} — свяжитесь с клиентом`,
            body: r.text ? `${r.authorName}: ${r.text}` : r.authorName,
            link: "/admin/reviews",
          }),
      },
    }));
  }

  get clients(): ClientsModule {
    return (this.#clients ??= new ClientsModule({ clock: this.clock }));
  }

  get assistant(): AssistantModule {
    return (this.#assistant ??= new AssistantModule({ clock: this.clock }));
  }

  get sales(): SalesModule {
    return (this.#sales ??= new SalesModule({ uow: this.uow, clock: this.clock, logger: consoleLogger("sales") }));
  }

  get notifications(): NotificationsModule {
    return (this.#notifications ??= new NotificationsModule({ mailer: this.mailer, clock: this.clock }));
  }

  get authoring(): AuthoringModule {
    return (this.#authoring ??= new AuthoringModule({ uow: this.uow, clock: this.clock, bus: this.bus, orders: { bookHasOrders: (bookId) => this.ordering.queries.bookHasOrders(bookId) }, mailer: this.mailer }));
  }

  get identity(): IdentityModule {
    return (this.#identity ??= new IdentityModule({ uow: this.uow, clock: this.clock, steps: createStepStore(), mailer: this.mailer }));
  }

  /** Access пользуется учётными записями Identity через узкий порт — модули не импортируют друг друга. */
  get access(): AccessModule {
    return (this.#access ??= new AccessModule({
      accounts: {
        create: (input) => this.identity.accounts.provision(input),
        setPassword: (userId, password) => this.identity.accounts.setPassword(userId, password),
        revokeSessions: (userId) => this.identity.auth.revokeAllSessions(userId),
        resetTwoFactor: (userId) => this.identity.accounts.resetTwoFactorByAdmin(userId),
      },
    }));
  }
  #printFiles?: PrintFilesService;
  #previews?: BookPreviewService;
  #renderer?: BookRenderer;

  /** Рендер PDF читает книгу через read-модель Authoring, а не таблицы напрямую. */
  private get renderer(): BookRenderer {
    return (this.#renderer ??= reactPdfRenderer((bookId) => this.authoring.queries.bundle(bookId)));
  }

  get printFiles(): PrintFilesService {
    return (this.#printFiles ??= new PrintFilesService(this.renderer, storageFileStore, pdfRenderQueue, consoleLogger("production")));
  }

  get previews(): BookPreviewService {
    return (this.#previews ??= new BookPreviewService(this.renderer, storageFileStore, pdfRenderQueue));
  }

  get ordering(): OrderingModule {
    return (this.#ordering ??= new OrderingModule({
      uow: this.uow,
      bus: this.bus,
      clock: this.clock,
      logger: consoleLogger("ordering"),
      printFiles: this.printFiles,
      mailer: this.mailer,
      books: {
        checkoutInfo: (bookId, userId, locale) => this.authoring.ordering.checkoutInfo(bookId, userId, locale),
        lockForOrder: (bookId) => this.authoring.ordering.lockForOrder(bookId),
        unlock: (bookId) => this.authoring.ordering.unlock(bookId),
        toggleEditing: (bookId) => this.authoring.ordering.toggleEditing(bookId),
      },
    }));
  }

  /** Состояние инфраструктуры для /api/health: Redis (null — не настроен) и очередь событий outbox. */
  /** База отвечает (для мониторинга). */
  async databaseHealthy() {
    try {
      await rootDb.execute(sql`select 1`);
      return true;
    } catch {
      return false;
    }
  }

  /** Хранилище файлов доступно на запись. */
  async storageHealthy() {
    try {
      await putFile("cache/health-check", "ok");
      await deleteFile("cache/health-check");
      return true;
    } catch {
      return false;
    }
  }

  async infraHealth() {
    const [redis, outbox] = await Promise.all([redisHealthy(), this.outbox.stats().catch(() => null)]);
    return { redis, outbox };
  }

  /** Создать все модули сразу — чтобы их подписки на события были зарегистрированы до первой команды. */
  boot(): this {
    void this.ordering;
    void this.identity;
    void this.access;
    void this.authoring;
    void this.sales;
    void this.automation;
    registerSubscriptions(this);
    return this;
  }
}

const g = globalThis as unknown as { __mybookContainer?: Container };

/** Контейнер приложения (один на процесс). */
export function container(): Container {
  return (g.__mybookContainer ??= new Container().boot());
}
