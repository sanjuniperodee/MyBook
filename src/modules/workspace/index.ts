import { CustomFieldsService } from "./application";
import { drizzleFields, drizzleInbox, drizzleTemplates } from "./infrastructure/persistence";

export { WorkspaceError, customFieldTypes, type CustomFieldType } from "./domain";

/** Публичный фасад «Рабочего пространства CRM»: свои поля, шаблоны ответов, уведомления и push сотрудников. */
export class WorkspaceModule {
  readonly fields = new CustomFieldsService(drizzleFields);
  readonly templates = drizzleTemplates;
  readonly inbox = drizzleInbox;
}
