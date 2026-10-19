import type { Clock, StaffNotifier, WorkSchedule } from "@/shared/application";
import { ClientOnboardingService, ClientsService, NotesService, TasksService, type DealContacts, type OnboardingAccounts, type OnboardingSales, type StaffMessenger, type StaffNotifier as ClientsNotifier } from "./application";
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
  constructor(deps: { clock: Clock; notifier: StaffNotifier<"deals.view">; messenger?: StaffMessenger; schedule?: WorkSchedule; accounts: OnboardingAccounts; sales: OnboardingSales; deals?: DealContacts }) {
    // Ничья задача напоминает всем, кто видит сделки.
    const notifier: ClientsNotifier = { notify: (ids, n) => deps.notifier.notify(ids, n), dealsTeam: (n) => deps.notifier.notifyAllWith("deals.view", n) };
    this.tasks = new TasksService(drizzleTasks, drizzleLinks, notifier, deps.clock, drizzleStaff, deps.messenger ?? null, deps.schedule ?? null);
    this.notes = new NotesService(drizzleNotes, drizzleStaff, notifier, deps.deals ?? null);
    this.onboarding = new ClientOnboardingService(deps.accounts, deps.sales, this.clients, this.notes, this.tasks);
  }

  /** Контакт для звонка, чата или письма (номер и адрес — только на сервере). */
  contact(target: ContactTarget) {
    return resolveContact(target);
  }
}
