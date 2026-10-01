import type { Clock } from "@/shared/application";
import { ClientsService, NotesService, TasksService } from "./application";
import { crmNotifier } from "./infrastructure/adapters";
import { drizzleClients, drizzleLinks, drizzleNotes, drizzleStaff, drizzleTasks, resolveContact, type ContactTarget } from "./infrastructure/persistence";

export { ClientsError } from "./domain";
export type { Actor } from "./application";
export type { ContactTarget };

/** Публичный фасад контекста «Клиенты CRM»: профиль клиента, задачи и заметки менеджеров. */
export class ClientsModule {
  readonly clients = new ClientsService(drizzleClients, drizzleStaff);
  readonly tasks: TasksService;
  readonly notes = new NotesService(drizzleNotes, drizzleStaff, crmNotifier);
  readonly links = drizzleLinks;

  constructor(deps: { clock: Clock }) {
    this.tasks = new TasksService(drizzleTasks, drizzleLinks, crmNotifier, deps.clock);
  }

  /** Контакт для звонка, чата или письма (номер и адрес — только на сервере). */
  contact(target: ContactTarget) {
    return resolveContact(target);
  }
}
