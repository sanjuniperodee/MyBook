import type { Clock, StaffNotifier } from "@/shared/application";
import { ClientOnboardingService, ClientsService, NotesService, TasksService, type OnboardingAccounts, type OnboardingSales } from "./application";
import { drizzleClients, drizzleLinks, drizzleNotes, drizzleStaff, drizzleTasks, resolveContact, type ContactTarget } from "./infrastructure/persistence";

export { ClientsError } from "./domain";
export type { Actor, OnboardingInput, OnboardingResult } from "./application";
export type { ContactTarget };

/** Публичный фасад контекста «Клиенты CRM»: профиль клиента, задачи и заметки менеджеров. */
export class ClientsModule {
  readonly clients = new ClientsService(drizzleClients, drizzleStaff);
  readonly tasks: TasksService;
  readonly notes: NotesService;
  readonly links = drizzleLinks;
  /** Менеджер заводит клиента: аккаунт, профиль, сделка, предоплата, заметка и задачи. */
  readonly onboarding: ClientOnboardingService;

  /** Уведомления о задачах и упоминаниях — порт рабочего пространства; аккаунты и продажи — порты для онбординга. */
  constructor(deps: { clock: Clock; notifier: StaffNotifier; accounts: OnboardingAccounts; sales: OnboardingSales }) {
    this.tasks = new TasksService(drizzleTasks, drizzleLinks, deps.notifier, deps.clock);
    this.notes = new NotesService(drizzleNotes, drizzleStaff, deps.notifier);
    this.onboarding = new ClientOnboardingService(deps.accounts, deps.sales, this.clients, this.notes, this.tasks);
  }

  /** Контакт для звонка, чата или письма (номер и адрес — только на сервере). */
  contact(target: ContactTarget) {
    return resolveContact(target);
  }
}
