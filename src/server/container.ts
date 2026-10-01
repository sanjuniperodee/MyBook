import "server-only";
import { consoleLogger, systemClock, type Clock, type EventBus, type UnitOfWork } from "@/shared/application";
import { DrizzleUnitOfWork, InProcessEventBus, OutboxDispatcher } from "@/shared/infrastructure";
import { createRateLimiter, createStepStore, redisHealthy } from "@/shared/infrastructure/redis";
import { OrderingModule } from "@/modules/ordering";
import { IdentityModule } from "@/modules/identity";
import { AccessModule } from "@/modules/access";
import { PrintFilesService } from "@/modules/production";
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

  #ordering?: OrderingModule;
  #identity?: IdentityModule;
  #access?: AccessModule;

  get identity(): IdentityModule {
    return (this.#identity ??= new IdentityModule({ uow: this.uow, clock: this.clock, steps: createStepStore() }));
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

  get printFiles(): PrintFilesService {
    return (this.#printFiles ??= new PrintFilesService(reactPdfRenderer, storageFileStore, pdfRenderQueue, consoleLogger("production")));
  }

  get ordering(): OrderingModule {
    return (this.#ordering ??= new OrderingModule({ uow: this.uow, bus: this.bus, clock: this.clock, logger: consoleLogger("ordering"), printFiles: this.printFiles }));
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
    registerSubscriptions(this);
    return this;
  }
}

const g = globalThis as unknown as { __mybookContainer?: Container };

/** Контейнер приложения (один на процесс). */
export function container(): Container {
  return (g.__mybookContainer ??= new Container().boot());
}
