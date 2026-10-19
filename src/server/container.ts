import "server-only";
import { consoleLogger, systemClock, type Clock, type EventBus, type Mailer, type UnitOfWork } from "@/shared/application";
import { DrizzleUnitOfWork, InProcessEventBus, OutboxDispatcher } from "@/shared/infrastructure";
import { rootDb } from "@/shared/infrastructure/database";
import { deleteFile, putFile } from "@/shared/infrastructure/storage";
import { sql } from "drizzle-orm";
import { env } from "@/config/env";
import { createRateLimiter, createStepStore, redisHealthy } from "@/shared/infrastructure/redis";
import { SmtpMailer } from "@/shared/infrastructure/mail";
import { OrderingModule } from "@/modules/ordering";
import { IdentityModule, isPhoneEmail } from "@/modules/identity";
import { AccessModule } from "@/modules/access";
import { AuthoringModule } from "@/modules/authoring";
import { NotificationsModule } from "@/modules/notifications";
import { SalesModule, sourceFromChannel } from "@/modules/sales";
import { MessagingModule } from "@/modules/messaging";
import { botInvoices } from "./deal-invoices";
import { TelephonyModule } from "@/modules/telephony";
import { MarketingModule } from "@/modules/marketing";
import { AssistantModule } from "@/modules/assistant";
import { ClientsModule } from "@/modules/clients";
import { ReportingModule } from "@/modules/reporting";
import { WorkspaceModule, smtpConfig } from "@/modules/workspace";
import { FeedbackModule, reviewUrl, THANK_YOU } from "@/modules/feedback";
import { ReferralsModule } from "@/modules/referrals";
import { AutomationModule } from "@/modules/automation";
import { BookPreviewService, PrintFilesService, pdfRenderQueue, reactPdfRenderer, renderGiftPdf, storageFileStore, type BookRenderer } from "@/modules/production";
import { registerSubscriptions } from "./subscriptions";
import { createInvoiceAccess, type InvoiceAccess } from "./invoice-access";
import { kaspiConfig, whatsappSettings } from "./integration-settings";
import { botSiteInfo } from "./bot-site";
import { referralPromos } from "./promo-ports";
import { requestOrigin } from "./rateLimit";

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
  #invoiceAccess?: InvoiceAccess;
  /** Отчёты — только чтение. */
  readonly reporting = new ReportingModule();
  readonly workspace = new WorkspaceModule();

  /** Правила CRM работают со сделками через узкий порт продаж. */
  get automation(): AutomationModule {
    return (this.#automation ??= new AutomationModule({
      clock: this.clock,
      notifier: this.workspace.notifier,
      schedule: this.workspace.schedule,
      fields: this.workspace.fieldsReader,
      // Автоответ правила молчит, если диалог ведёт бот-квалификатор (иначе клиенту два автоответа подряд); текст с
      // реквизитами не уходит — заметка в сделку и руководителю.
      sendMessage: async (conversationId, text, opts) => void (await this.messaging.chats.sendAutomated(conversationId, text, opts)),
      sales: {
        nextRoundRobin: () => this.sales.routing.next(),
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
      settings: this.workspace.settings,
      notifier: this.workspace.notifier,
      live: this.workspace.live,
      schedule: this.workspace.schedule,
      fields: this.workspace.fieldsReader,
      smtpConfig,
      smtp: this.smtp,
      rules: {
        messageIncoming: async (ctx) => {
          await this.automation.engine.run("message.incoming", ctx);
          // Клиент написал в чат счёта, по которому доступ не ушёл, — отправить ещё раз (один раз); сбой не ломает приём.
          await this.invoiceAccess.onIncoming(ctx).catch((err) => console.error("[invoice-access] incoming", err));
        },
      },
      links: { fromText: (text) => this.marketing.service.attributionFromText(text) },
      whatsapp: () => this.marketing.service.shopWhatsapp(),
      whatsappSettings,
      botInvoices,
      sales: {
        findClientByPhone: (phone) => this.sales.deals.findClientByPhone(phone),
        findOpenDeal: (opts) => this.sales.deals.findOpen(opts),
        createDeal: ({ channel, source, ...input }) => this.sales.deals.create({ ...input, source: source ?? sourceFromChannel(channel) }),
        setUtmIfEmpty: (dealId, utm) => this.sales.deals.setUtmIfEmpty(dealId, utm),
        acceptUnsorted: (dealId, authorId, how) => this.sales.deals.acceptUnsorted(dealId, authorId, how),
        claimNewLead: async (dealId, userId, how) => {
          const d = await this.sales.deals.findById(dealId);
          if (!d) return { claimed: false, previous: null };
          if (d.assigneeId === userId) {
            await this.sales.deals.acceptUnsorted(dealId, userId, how);
            return { claimed: true, previous: null };
          }
          const stage = await this.sales.deals.stage(d.stageId);
          const first = stage ? await this.sales.deals.stageOfKind("open", stage.pipelineId) : null;
          // Новая заявка: ещё в «Неразобранном», без ответственного или на первом этапе воронки.
          const fresh = d.unsorted || !d.assigneeId || (!!stage && first?.id === stage.id);
          if (!fresh) return { claimed: false, previous: null };
          await this.sales.deals.assign(dealId, userId);
          await this.sales.deals.acceptUnsorted(dealId, userId, how);
          return { claimed: true, previous: d.assigneeId };
        },
        note: (deal, text) => this.sales.deals.note(deal, text, null),
        setField: (dealId, key, value) => this.sales.deals.setField(dealId, key, value),
        deal: (dealId) => this.sales.deals.findById(dealId),
        nextRoundRobin: () => this.sales.routing.next(),
      },
      // Бот-квалификатор: перед опросом смотрит сделку (этап, ответственный, заказ) и клиента (заказы, книги).
      botCrm: {
        deal: async (dealId) => {
          const d = await this.sales.deals.findById(dealId);
          if (!d) return null;
          const stage = await this.sales.deals.stage(d.stageId);
          const first = stage ? await this.sales.deals.stageOfKind("open", stage.pipelineId) : null;
          return {
            orderId: d.orderId,
            // Сколько по сделке уже оплачено (счета): если больше нуля — предоплату бот не предлагает.
            paid: await this.sales.payments.paidTotal(d.id),
            firstStage: !!stage && first?.id === stage.id,
            closed: !!stage && stage.kind !== "open",
            assigneeId: d.assigneeId,
            unsorted: d.unsorted,
            customFields: d.customFields,
            contactName: d.contactName,
            title: d.title,
            clientId: d.clientId,
          };
        },
        client: async (clientId) => {
          const [orders, books, profile] = await Promise.all([this.ordering.queries.userOrders(clientId), this.authoring.queries.userBooks(clientId), this.clients.clients.find(clientId)]);
          return { orders: orders.length, books: books.length, locale: null, name: profile?.name ?? null };
        },
        tag: async (dealId, tag) => void (await this.sales.deals.addTag(dealId, tag)),
        // Оплата для AI: платежи сделки — и ручные (менеджер), и онлайн по счетам из чата; у пакета книг — по всем его сделкам.
        payments: async ({ id, clientId, orderId }) => {
          const batch = await this.sales.batch.of(id);
          const ids = batch.length ? batch.map((b) => b.id) : [id];
          const [money, deal, rows, invoices, orders, gifts] = await Promise.all([
            this.sales.batch.money(id),
            this.sales.deals.findById(id),
            Promise.all(ids.map((x) => this.sales.payments.list(x))).then((r) => r.flat()),
            Promise.all(ids.map((x) => this.ordering.invoices.listFor(x))).then((r) => r.flat()),
            clientId ? this.ordering.queries.userOrders(clientId) : Promise.resolve([]),
            this.sales.agreedGifts.get(id),
          ]);
          return {
            gifts,
            paid: money.paid,
            agreed: deal?.amount ?? 0,
            batchSize: money.size,
            payments: rows.map((p) => ({ amount: p.amount, kind: p.kind, method: p.method, at: p.paidAt.toISOString() })),
            invoices: invoices.map((inv) => {
              const s = inv.snapshot();
              return { number: s.number, amount: s.amount, purpose: s.purpose, status: s.status, method: s.paidMethod, at: s.createdAt.toISOString(), paidAt: s.paidAt?.toISOString() ?? null };
            }),
            orders: orders.map((o) => ({ number: o.number, status: o.status, dealOrder: o.id === orderId })),
          };
        },
      },
      botSite: botSiteInfo,
      // Режим «Продаёт» с движком AI: отдельная модель продажника («Интеграции» → AI → «Модель продажника»).
      sellerModel: { configured: () => this.assistant.seller.configured(), complete: (input) => this.assistant.seller.complete(input), media: (input) => this.assistant.seller.media(input) },
      // Квалификатор: AI только понимает ответ, который бот не разобрал сам; тексты клиенту — шаблоны из настроек.
      brain: {
        understand: async (input) => {
          const r = await this.assistant.service.understandForBot(input);
          return r && { fields: r.fields, intents: r.intents, handoff: r.handoff, lang: r.lang };
        },
      },
    }));
  }

  /** Звонки создают сделки через порт продаж; спам-лист — из переписки, правила на пропущенные — из автоматизаций. */
  get telephony(): TelephonyModule {
    return (this.#telephony ??= new TelephonyModule({
      clock: this.clock,
      settings: this.workspace.settings,
      notifier: this.workspace.notifier,
      live: this.workspace.live,
      isBlocked: (phone) => this.messaging.chats.isBlocked(phone),
      missedRules: (ctx) => this.automation.engine.run("call.missed", ctx),
      sales: {
        findClientByPhone: (phone) => this.sales.deals.findClientByPhone(phone),
        findOpenDealId: async (opts) => (await this.sales.deals.findOpen(opts))?.id ?? null,
        createCallDeal: (input) => this.sales.deals.create({ ...input, source: "call", unsorted: true }),
        dealOwner: (dealId) => this.sales.deals.findById(dealId),
        acceptDeal: (dealId, staffId, how) => this.sales.deals.acceptUnsorted(dealId, staffId, how),
      },
    }));
  }

  /** Персональные промокоды выпускает контекст заказов. */
  get marketing(): MarketingModule {
    return (this.#marketing ??= new MarketingModule({ clock: this.clock, settings: this.workspace.settings, promos: { issuePersonal: (input) => this.ordering.promos.issuePersonal(input) } }));
  }

  /** Приглашения: коды для друзей и награды — промокоды контекста заказов. */
  get referrals(): ReferralsModule {
    return (this.#referrals ??= new ReferralsModule({ mailer: this.mailer, clock: this.clock, logger: consoleLogger("referrals"), promos: referralPromos(this.ordering.promos, () => this.clock.now()) }));
  }

  /** Отзывы: благодарность — промокод контекста заказов, низкая оценка — уведомление тем, кто разбирает отзывы. */
  get feedback(): FeedbackModule {
    return (this.#feedback ??= new FeedbackModule({
      uow: this.uow,
      clock: this.clock,
      logger: consoleLogger("feedback"),
      promos: { issue: async (input) => (await this.ordering.promos.issuePersonal(input))?.code ?? null },
      alerts: {
        lowRating: (r) =>
          this.workspace.notifier.notifyAllWith("reviews.manage", {
            kind: "system",
            title: `Отзыв ${r.rating}★ к заказу №${r.orderNumber} — свяжитесь с клиентом`,
            body: r.text ? `${r.authorName}: ${r.text}` : r.authorName,
            link: "/admin/reviews",
          }),
      },
    }));
  }

  get clients(): ClientsModule {
    return (this.#clients ??= new ClientsModule({
      clock: this.clock,
      notifier: this.workspace.notifier,
      // Напоминания о задачах — личным сообщением сотруднику на его номер (users.phone), ссылка на задачу — абсолютная.
      messenger: {
        send: async (userId, text) => {
          const phone = (await this.identity.accounts.account(userId))?.phone;
          return phone ? this.messaging.sendToPhone(phone, text.replace(/\n(\/admin\S*)$/, `\n${env.appUrl}$1`)) : false;
        },
      },
      // Онбординг клиента ходит в identity и sales через порты — модули друг друга не знают.
      accounts: { provisionClient: (input) => this.identity.accounts.provisionClient(input) },
      sales: {
        stages: () => this.sales.queries.listStages(),
        createDeal: (input) => this.sales.deals.create(input),
        setAgreedPlan: async (dealId, plan) => void (await this.sales.agreedPlan.set(dealId, plan)),
        setAgreedGifts: async (dealId, gifts) => void (await this.sales.agreedGifts.set(dealId, gifts)),
        setBatch: (dealId, batchId, index, size) => this.sales.batch.set(dealId, batchId, index, size),
        tagDeal: async (dealId, tag) => void (await this.sales.deals.addTag(dealId, tag)),
        addPayment: (input) => this.sales.payments.add(input),
        // Клиент заведён из сделки: сделка и её переписка привязываются к аккаунту.
        linkClient: async (dealId, clientId) => {
          await this.sales.deals.linkClient(dealId, clientId);
          await this.messaging.chats.linkDealClient(dealId, clientId);
        },
      },
      // Заметка «звонок/сообщение/письмо» в сделке — менеджер связался с клиентом: заявка принята в работу.
      deals: { accept: (dealId, staffId, how) => this.sales.deals.acceptUnsorted(dealId, staffId, how) },
    }));
  }

  get assistant(): AssistantModule {
    return (this.#assistant ??= new AssistantModule({ clock: this.clock, settings: this.workspace.settings, fields: this.workspace.fieldsReader, conversations: { messages: (conversationId, limit) => this.messaging.view.messages(conversationId, limit) } }));
  }

  get sales(): SalesModule {
    return (this.#sales ??= new SalesModule({
      uow: this.uow,
      clock: this.clock,
      logger: consoleLogger("sales"),
      settings: this.workspace.settings,
      schedule: this.workspace.schedule,
      // Принятые деньги: заметка в карточке клиента, журнал сотрудников и письмо клиенту — через порты.
      paymentEffects: {
        note: async (actor, input) => void (await this.clients.notes.add(actor, { kind: "note", text: input.text, dealId: input.dealId, clientId: input.clientId ?? undefined })),
        audit: (input) => this.access.audit.record(input),
        mailClient: async (input) => (await import("./client-mail")).mailPaymentToClient(this, input),
        markInvoicePaid: async (input) => void (await this.ordering.invoices.markPaidManually(input)),
      },
      notifier: {
        notify: (userIds, n) => this.workspace.notifier.notify(userIds, n),
        owners: (n) => this.workspace.notifier.notifyAllWith("team.manage", n),
      },
      // Счета из чата живут в заказах: слияние сделок переносит их, удаление сделки их учитывает — в транзакции продаж.
      invoices: {
        moveAll: (input) => this.ordering.invoiceLifecycle.moveAll(input),
        holdForDelete: (dealId) => this.ordering.invoiceLifecycle.holdForDelete(dealId),
        purgeClosed: (dealId) => this.ordering.invoiceLifecycle.purgeClosed(dealId),
      },
    }));
  }

  get notifications(): NotificationsModule {
    return (this.#notifications ??= new NotificationsModule({ mailer: this.mailer, clock: this.clock, reviews: { url: reviewUrl, thankYouPercent: THANK_YOU.percent } }));
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
      settings: this.workspace.settings,
      login: { isPhoneEmail },
      origin: requestOrigin,
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
    return (this.#previews ??= new BookPreviewService(this.renderer, storageFileStore, pdfRenderQueue, (bookId) => this.ordering.queries.bookPaid(bookId)));
  }

  get ordering(): OrderingModule {
    return (this.#ordering ??= new OrderingModule({
      uow: this.uow,
      bus: this.bus,
      clock: this.clock,
      logger: consoleLogger("ordering"),
      printFiles: this.printFiles,
      giftPdf: { render: renderGiftPdf },
      mailer: this.mailer,
      books: {
        checkoutInfo: (bookId, userId, locale) => this.authoring.ordering.checkoutInfo(bookId, userId, locale),
        lockForOrder: (bookId) => this.authoring.ordering.lockForOrder(bookId),
        unlock: (bookId) => this.authoring.ordering.unlock(bookId),
        toggleEditing: (bookId) => this.authoring.ordering.toggleEditing(bookId),
      },
      agreements: { agreementFor: (userId) => this.sales.agreementFor(userId), attachOrder: (dealId, orderId) => this.sales.attachAgreementOrder(dealId, orderId) },
      kaspiConfig,
      // Слежка за кассиром Kaspi: состояние и порог тревоги — в настройках, тревога — руководителям.
      settings: this.workspace.settings,
      notifier: this.workspace.notifier,
      // Счёт из чата читает сделку и пишет её деньги через порт продаж.
      invoiceSales: {
        deal: async (dealId) => {
          const d = await this.sales.deals.findById(dealId);
          if (!d) return null;
          const stage = await this.sales.deals.stage(d.stageId);
          // Деньги пакета (клиент оплатил сразу несколько книг) лежат в сделке счёта, а делятся между книгами при расчёте: счёт видит пакет целиком.
          const batch = await this.sales.batch.money(d.id);
          return { id: d.id, number: d.number, title: d.title, clientId: d.clientId, assigneeId: d.assigneeId, amount: d.amount, paid: batch.size ? batch.paid : await this.sales.payments.paidTotal(d.id), batchSize: batch.size, orderId: d.orderId, closed: !!stage && stage.kind !== "open", gifts: await this.sales.agreedGifts.get(d.id) };
        },
        setAgreement: async (dealId, { plan, agreedTotal, count, gifts, actorId }) => {
          await this.sales.agreedPlan.set(dealId, plan);
          // Бесплатное по договорённости — в сделку (до пакета: копии сделки его наследуют).
          await this.sales.changeAgreedGifts(dealId, gifts, actorId, "invoice");
          await this.sales.deals.setAgreedTotal(dealId, agreedTotal, actorId);
          // Несколько книг — сделка становится пакетом (копии под остальные книги).
          if (count > 1) await this.sales.splitIntoBatch(dealId, count, actorId);
        },
        acceptOnline: async (input) => {
          const row = await this.sales.payments.addOnline(input);
          return row ? { paymentId: row.id } : null;
        },
      },
    }));
  }

  /**
   * После оплаты счёта из чата: клиент находится или заводится по номеру чата, сделка, переписка и деньги привязываются,
   * доступ в кабинет уходит в тот же чат (проход планировщика), заметки и уведомления — подписчики событий счёта.
   */
  get invoiceAccess(): InvoiceAccess {
    return (this.#invoiceAccess ??= createInvoiceAccess(this));
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
