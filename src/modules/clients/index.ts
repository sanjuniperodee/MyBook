import type { Clock, StaffNotifier } from "@/shared/application";
import { ClientOnboardingService, ClientsService, NotesService, TasksService, type DealContacts, type OnboardingAccounts, type OnboardingSales, type StaffMessenger } from "./application";
import { accountUsage, accountsByOtherPhones, drizzleClients, drizzleLinks, drizzleNotes, drizzleStaff, drizzleTasks, resolveContact, type ContactTarget } from "./infrastructure/persistence";

export { ClientsError } from "./domain";
export type { AccountUsage, Actor, DealPart, ExistingClientDealsInput, OnboardingInput, OnboardingResult } from "./application";
export type { ContactTarget };

/** Публичный фасад контекста «Клиенты CRM»: профиль клиента, задачи и заметки менеджеров. */
export class ClientsModule {
  readonly clients = new ClientsService(drizzleClients, drizzleStaff);
  readonly tasks: TasksService;
  readonly notes: NotesService;
  readonly links = drizzleLinks;
  /** Пользовался ли клиент аккаунтом (заходил, книги, заказы): новому — ссылка «задайте пароль», давнему — «войдите как обычно». */
  readonly usage = accountUsage;
  /** Клиенты, у которых номер — доп. телефон или контакт заказа (не подтверждает, чей аккаунт). */
  readonly accountsByOtherPhones = accountsByOtherPhones;
  /** Менеджер заводит клиента: аккаунт, профиль, сделка, предоплата, заметка и задачи. */
  readonly onboarding: ClientOnboardingService;

  /** Уведомления о задачах и упоминаниях — порт рабочего пространства; аккаунты и продажи — порты для онбординга и принятия заявки. */
  constructor(deps: { clock: Clock; notifier: StaffNotifier; messenger?: StaffMessenger; accounts: OnboardingAccounts; sales: OnboardingSales; deals?: DealContacts }) {
    this.tasks = new TasksService(drizzleTasks, drizzleLinks, deps.notifier, deps.clock, drizzleStaff, deps.messenger ?? null);
    this.notes = new NotesService(drizzleNotes, drizzleStaff, deps.notifier, deps.deals ?? null);
    this.onboarding = new ClientOnboardingService(deps.accounts, deps.sales, this.clients, this.notes, this.tasks);
  }

  /** Контакт для звонка, чата или письма (номер и адрес — только на сервере). */
  contact(target: ContactTarget) {
    return resolveContact(target);
  }
}
