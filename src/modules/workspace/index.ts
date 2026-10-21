import { CustomFieldsService } from "./application";
import { drizzleFields, drizzleInbox, drizzleTemplates } from "./infrastructure/persistence";
import { settingsStore } from "./infrastructure/settings";
import { customFieldsReader } from "./infrastructure/fields";
import { staffNotifier } from "./infrastructure/notify";
import { liveFeed } from "./infrastructure/realtime";
import { workSchedule } from "./infrastructure/schedule";

export { WorkspaceError } from "./domain";
export { getSetting, getSettings, saveSettings, deleteSetting, ensureToken, fromEnv, maskSecret, type SettingKey } from "./infrastructure/settings";
export { listFields, readFieldValues } from "./infrastructure/fields";
export { notify, staffNotifier } from "./infrastructure/notify";
export { subscribe, type LiveEvent } from "./infrastructure/realtime";
export { mentionableStaff, notifyMentions } from "./infrastructure/mentions";
export { vapidKeys } from "./infrastructure/push";
export { mobileDevices } from "./infrastructure/mobileDevices";
export { staffNotifications } from "./infrastructure/notificationsList";
export { smtpConfig, smtpFromEnvironment } from "./infrastructure/mail";

/** Публичный фасад «Рабочего пространства CRM»: свои поля, шаблоны ответов, уведомления и push сотрудников. */
export class WorkspaceModule {
  readonly fields = new CustomFieldsService(drizzleFields);
  readonly templates = drizzleTemplates;
  readonly inbox = drizzleInbox;

  // Порты для других модулей (src/shared/application): модули получают их из корня композиции, а не импортом.
  /** Настройки «Интеграций»: модуль видит только объявленные им ключи. */
  readonly settings = settingsStore;
  /** Уведомления сотрудникам. */
  readonly notifier = staffNotifier;
  /** Живое обновление открытых экранов CRM. */
  readonly live = liveFeed;
  /** Свои поля сделки и клиента — только чтение (правка — fields). */
  readonly fieldsReader = customFieldsReader;
  /** Рабочее время отдела продаж. */
  readonly schedule = workSchedule;
}
