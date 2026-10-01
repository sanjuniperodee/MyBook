import "server-only";
import { consoleLogger, systemClock, type Clock, type EventBus, type UnitOfWork } from "@/shared/application";
import { DrizzleUnitOfWork, InProcessEventBus } from "@/shared/infrastructure";
import { OrderingModule } from "@/modules/ordering";
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
  readonly uow: UnitOfWork = new DrizzleUnitOfWork(this.bus);
  readonly clock: Clock = systemClock;

  #ordering?: OrderingModule;
  #printFiles?: PrintFilesService;

  get printFiles(): PrintFilesService {
    return (this.#printFiles ??= new PrintFilesService(reactPdfRenderer, storageFileStore, pdfRenderQueue, consoleLogger("production")));
  }

  get ordering(): OrderingModule {
    return (this.#ordering ??= new OrderingModule({ uow: this.uow, bus: this.bus, clock: this.clock, logger: consoleLogger("ordering"), printFiles: this.printFiles }));
  }

  /** Создать все модули сразу — чтобы их подписки на события были зарегистрированы до первой команды. */
  boot(): this {
    void this.ordering;
    registerSubscriptions(this);
    return this;
  }
}

const g = globalThis as unknown as { __mybookContainer?: Container };

/** Контейнер приложения (один на процесс). */
export function container(): Container {
  return (g.__mybookContainer ??= new Container().boot());
}
