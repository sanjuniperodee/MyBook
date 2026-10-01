import { fieldKey, selectOptions, type CustomFieldType, type FieldEntity } from "../domain";

export interface FieldRepository {
  keys(entity: FieldEntity): Promise<string[]>;
  add(field: { entity: FieldEntity; key: string; label: string; type: CustomFieldType; options: string[] }): Promise<void>;
  update(id: string, patch: { label: string; type: CustomFieldType; options: string[] }): Promise<void>;
  delete(id: string): Promise<{ label: string } | null>;
}

/** Свои поля сделки и клиента. Удаление поля не трогает уже записанные значения — их просто не показываем. */
export class CustomFieldsService {
  constructor(private readonly fields: FieldRepository) {}

  async save(input: { id: string | null; entity: FieldEntity; label: string; type: CustomFieldType; options: string }) {
    const options = selectOptions(input.type, input.options);
    if (input.id) return this.fields.update(input.id, { label: input.label, type: input.type, options });
    const taken = new Set(await this.fields.keys(input.entity));
    await this.fields.add({ entity: input.entity, key: fieldKey(input.label, (k) => taken.has(k)), label: input.label, type: input.type, options });
  }

  delete(id: string) {
    return this.fields.delete(id);
  }
}

export interface TemplateRepository {
  add(t: { title: string; text: string }): Promise<void>;
  update(id: string, t: { title: string; text: string }): Promise<void>;
  delete(id: string): Promise<void>;
}

/** Уведомления и push-подписки сотрудника. */
export interface StaffInbox {
  markRead(userId: string, notificationId?: string): Promise<void>;
  subscribe(userId: string, s: { endpoint: string; p256dh: string; auth: string; userAgent: string }): Promise<void>;
  unsubscribe(userId: string, endpoint: string): Promise<void>;
}
