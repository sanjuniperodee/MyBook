import type { CustomFieldsReader, LiveEvent, LiveFeed, SettingsStore, StaffNotification, StaffNotifier, WorkSchedule } from "@/shared/application";
import type { CustomFieldDef, CustomFieldEntity, CustomFieldType } from "@/shared/domain/customFields";
import type { FieldRepository } from "@/modules/workspace/application";
import type { FieldEntity } from "@/modules/workspace/domain";

// ─── тестовые двойники ─────────────────────────────────────────────────────

interface FieldRow {
  id: string;
  entity: FieldEntity;
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[];
}

/** Свои поля в памяти: id по порядку добавления; правка несуществующего поля ничего не меняет (UPDATE … WHERE id). */
export class MemFields implements FieldRepository {
  rows = new Map<string, FieldRow>();
  keyLookups = 0;
  private seq = 0;
  async keys(entity: FieldEntity) {
    this.keyLookups++;
    return [...this.rows.values()].filter((f) => f.entity === entity).map((f) => f.key);
  }
  async add(f: Omit<FieldRow, "id">) {
    const id = `field-${++this.seq}`;
    this.rows.set(id, { id, ...f });
  }
  async update(id: string, patch: Pick<FieldRow, "label" | "type" | "options">) {
    const f = this.rows.get(id);
    if (f) this.rows.set(id, { ...f, ...patch });
  }
  async delete(id: string) {
    const f = this.rows.get(id);
    if (!f) return null;
    this.rows.delete(id);
    return { label: f.label };
  }
  last() {
    return [...this.rows.values()].at(-1)!;
  }
}

// ─── порты рабочего пространства (src/shared/application) для тестов модулей ─

/** Настройки в памяти: нет значения — пустая строка (как getSetting без значения по умолчанию); пустая строка в save удаляет. */
export class MemSettings<K extends string> implements SettingsStore<K> {
  values = new Map<K, string>();
  saves: { values: Partial<Record<K, string>>; actorId: string | null }[] = [];
  constructor(initial: Partial<Record<K, string>> = {}) {
    for (const [k, v] of Object.entries(initial) as [K, string][]) this.values.set(k, v);
  }
  async get(key: K) {
    return this.values.get(key) ?? "";
  }
  async getMany<T extends K>(keys: T[]) {
    return Object.fromEntries(keys.map((k) => [k, this.values.get(k) ?? ""])) as Record<T, string>;
  }
  async save(values: Partial<Record<K, string>>, actorId: string | null) {
    this.saves.push({ values, actorId });
    for (const [k, v] of Object.entries(values) as [K, string][]) {
      if (v === "") this.values.delete(k);
      else this.values.set(k, v);
    }
  }
}

/** Уведомления: кому и что ушло. withPermission — у кого из сотрудников есть право (как staffWith в workspace). */
export class SpyStaffNotifier implements StaffNotifier {
  sent: { to: string[]; n: StaffNotification }[] = [];
  constructor(private readonly withPermission: Record<string, string[]> = {}) {}
  async notify(userIds: (string | null | undefined)[], n: StaffNotification) {
    const to = [...new Set(userIds.filter((x): x is string => !!x))];
    if (to.length) this.sent.push({ to, n });
  }
  async notifyOwnerOr(assigneeId: string | null | undefined, permission: string, n: StaffNotification) {
    await this.notify(assigneeId ? [assigneeId] : (this.withPermission[permission] ?? []), n);
  }
  async notifyAllWith(permission: string, n: StaffNotification) {
    await this.notify(this.withPermission[permission] ?? [], n);
  }
}

export class SpyLiveFeed implements LiveFeed {
  events: LiveEvent[] = [];
  async publish(e: LiveEvent) {
    this.events.push(e);
  }
}

/** Свои поля для чтения: заданы тестом по сущностям; lookups — сколько раз их читали. */
export class MemFieldsReader implements CustomFieldsReader {
  lookups = 0;
  constructor(readonly fields: Partial<Record<CustomFieldEntity, CustomFieldDef[]>> = {}) {}
  async list(entity: CustomFieldEntity) {
    this.lookups++;
    return this.fields[entity] ?? [];
  }
}

/** График: рабочее ли время и сколько рабочих минут прошло — задаёт тест; asked — о каких моментах спрашивали. */
export class FixedSchedule implements WorkSchedule {
  asked: Date[] = [];
  constructor(
    public working = true,
    public minutes = 0,
  ) {}
  async isWorkTime(at: Date) {
    this.asked.push(at);
    return this.working;
  }
  async workMinutesBetween() {
    return this.minutes;
  }
}
