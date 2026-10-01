import "server-only";
import { consoleLogger, systemClock, type Clock, type EventBus, type Mailer, type UnitOfWork } from "@/shared/application";
import { DrizzleUnitOfWork, InProcessEventBus, OutboxDispatcher } from "@/shared/infrastructure";
import { createRateLimiter, createStepStore, redisHealthy } from "@/shared/infrastructure/redis";
import { SmtpMailer } from "@/shared/infrastructure/mail";
import { OrderingModule } from "@/modules/ordering";
import { IdentityModule } from "@/modules/identity";
import { AccessModule } from "@/modules/access";
import { AuthoringModule } from "@/modules/authoring";
import { NotificationsModule } from "@/modules/notifications";
import { SalesModule } from "@/modules/sales";
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
  /** Почта по SMTP; без SMTP_HOST письма пишутся в лог. */
  readonly smtp = new SmtpMailer();
  readonly mailer: Mailer = this.smtp;

  #ordering?: OrderingModule;
  #identity?: IdentityModule;
  #access?: AccessModule;
  #authoring?: AuthoringModule;
  #notifications?: NotificationsModule;
  #sales?: SalesModule;

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
    registerSubscriptions(this);
    return this;
  }
}

const g = globalThis as unknown as { __mybookContainer?: Container };

/** Контейнер приложения (один на процесс). */
export function container(): Container {
  return (g.__mybookContainer ??= new Container().boot());
}
