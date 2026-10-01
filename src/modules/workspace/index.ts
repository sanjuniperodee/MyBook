import { CustomFieldsService } from "./application";
import { drizzleFields, drizzleInbox, drizzleTemplates } from "./infrastructure/persistence";

export { WorkspaceError, customFieldTypes, type CustomFieldType } from "./domain";
export { getSetting, getSettings, saveSettings, deleteSetting, ensureToken, fromEnv, maskSecret, invalidateSettings, type SettingKey } from "./infrastructure/settings";
export { listFields, fieldByKey, readFieldValues, fieldVars } from "./infrastructure/fields";
export { notify, notifyOwnerOr, staffWith, type NotificationInput } from "./infrastructure/notify";
export { publish, subscribe, type LiveEvent } from "./infrastructure/realtime";
export { mentionableStaff, notifyMentions } from "./infrastructure/mentions";
export { vapidKeys, pushTo } from "./infrastructure/push";
export { smtpConfig, smtpFromEnvironment } from "./infrastructure/mail";

/** Публичный фасад «Рабочего пространства CRM»: свои поля, шаблоны ответов, уведомления и push сотрудников. */
export class WorkspaceModule {
  readonly fields = new CustomFieldsService(drizzleFields);
  readonly templates = drizzleTemplates;
  readonly inbox = drizzleInbox;
}
