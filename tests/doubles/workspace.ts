import type { FieldRepository } from "@/modules/workspace/application";
import type { CustomFieldType, FieldEntity } from "@/modules/workspace/domain";

// ─── тестовые двойники ─────────────────────────────────────────────────────

export interface FieldRow {
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
