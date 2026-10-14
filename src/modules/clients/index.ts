import type { Clock, StaffNotifier } from "@/shared/application";
import { ClientsService, NotesService, TasksService } from "./application";
import { drizzleClients, drizzleLinks, drizzleNotes, drizzleStaff, drizzleTasks, resolveContact, type ContactTarget } from "./infrastructure/persistence";

export { ClientsError } from "./domain";
export type { Actor } from "./application";
export type { ContactTarget };

/** Публичный фасад контекста «Клиенты CRM»: профиль клиента, задачи и заметки менеджеров. */
export class ClientsModule {
  readonly clients = new ClientsService(drizzleClients, drizzleStaff);
  readonly tasks: TasksService;
  readonly notes: NotesService;
  readonly links = drizzleLinks;

  /** Уведомления о задачах и упоминаниях — порт рабочего пространства. */
  constructor(deps: { clock: Clock; notifier: StaffNotifier }) {
    this.tasks = new TasksService(drizzleTasks, drizzleLinks, deps.notifier, deps.clock);
    this.notes = new NotesService(drizzleNotes, drizzleStaff, deps.notifier);
  }

  /** Контакт для звонка, чата или письма (номер и адрес — только на сервере). */
  contact(target: ContactTarget) {
    return resolveContact(target);
  }
}
